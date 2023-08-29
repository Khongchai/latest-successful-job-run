package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/google/go-github/v54/github"
	"golang.org/x/oauth2"
)

const (
	githubEventName  = "GITHUB_EVENT_NAME"
	githubRef        = "GITHUB_REF"
	githubHeadRef    = "GITHUB_HEAD_REF"
	githubOutput     = "GITHUB_OUTPUT"
	githubRepository = "GITHUB_REPOSITORY"
)

func getCurrentBranchName() string {
	// if is pull request
	if os.Getenv(githubEventName) == "pull_request" {
		log.Printf("Event is pull request, returning GITHUB_HEAD_REF")
		return os.Getenv(githubHeadRef)
	} else {
		log.Printf("Event is not pull request, returning GITHUB_REF")
		// refs/heads/branch-name
		return strings.Split(os.Getenv(githubRef), "/")[2]
	}
}

// https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts
func getInput(inputName string, required bool) string {
	input := os.Getenv(fmt.Sprintf("INPUT_%s", strings.ReplaceAll(strings.ToUpper(inputName), " ", "_")))
	if required && strings.TrimSpace(input) == "" {
		panic(fmt.Sprintf("Input required and not supplied: %s", inputName))
	}
	return input
}

// https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts#L192C23-L192C23
func setOutput(outputName string, value string) {
	output := os.Getenv(githubOutput)
	f, err := os.OpenFile(output, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Error opening file: %s", err)
		panic(err)
	}
	defer f.Close()
	if _, err := f.WriteString(fmt.Sprintf("%s=%s\n", outputName, value)); err != nil {
		log.Printf("Error writing to file: %s", err)
		panic(err)
	}
}

// Return the commit hash of the last workflow run in which the specified job was successful.
// Defaults to the commit hash of the latest commit if the job was never successful or if this was the first run.
func getLastSuccessfulWorkflowRunCommit(ctx context.Context, client *github.Client, jobName string) string {
	owner_repo := strings.Split(os.Getenv(githubRepository), "/")
	owner := owner_repo[0]
	repo := owner_repo[1]
	currentBranchName := getCurrentBranchName()
	previousCompletedWorkflowRuns, _, err := client.Actions.ListRepositoryWorkflowRuns(ctx, owner, repo, &github.ListWorkflowRunsOptions{
		Status: "completed",
		Branch: currentBranchName,
		ListOptions: github.ListOptions{
			PerPage: 100,
		},
	})
	if err != nil {
		log.Printf("Error getting workflow runs: %s", err)
		panic(err)
	}

	// iterate the list of workflow from newest to oldest,
	// if the workflow run contains the specified job and it was successful, return the commit hash
	for _, workflowRun := range previousCompletedWorkflowRuns.WorkflowRuns {
		workflowRunJobs, _, err := client.Actions.ListWorkflowJobs(ctx, owner, repo, workflowRun.GetID(), &github.ListWorkflowJobsOptions{
			ListOptions: github.ListOptions{PerPage: 100},
		})
		if err != nil {
			log.Printf("Error getting workflow jobs: %s", err)
			panic(err)
		}

		thisRunCommitHash := workflowRun.GetHeadCommit().GetID()
		log.Printf("Checking all jobs in commit of hash: %s", thisRunCommitHash)
		for _, workflowRunJob := range workflowRunJobs.Jobs {
			log.Printf("Job name: %s", workflowRunJob.GetName())
			log.Printf("Job status: %s", workflowRunJob.GetStatus())
			log.Printf("Job conclusion: %s", workflowRunJob.GetConclusion())
			log.Printf("Job head branch: %s", workflowRunJob.GetHeadBranch())
			if workflowRunJob.GetName() == jobName &&
				workflowRunJob.GetStatus() == "completed" &&
				workflowRunJob.GetConclusion() == "success" &&
				workflowRunJob.GetHeadBranch() == currentBranchName {
				log.Printf("The hash of the latest commit in which the specified job was successful: %s", thisRunCommitHash)
				return thisRunCommitHash
			}
		}
	}

	// if is first ever workflow run, return
	log.Printf("Unable to find the specified job in successful state in any of the previous workflow runs, defaulting to the latest commit hash")
	return previousCompletedWorkflowRuns.WorkflowRuns[0].GetHeadCommit().GetID()
}

func main() {
	log.Printf("Starting the action")

	jobName := getInput("job", true)
	token := getInput("token", true)

	ctx := context.Background()
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)

	tc := oauth2.NewClient(ctx, ts)
	ghClient := github.NewClient(tc)

	sha := getLastSuccessfulWorkflowRunCommit(ctx, ghClient, jobName)

	setOutput("sha", sha)
}
