package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/google/go-github/v54/github"
)

// https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts
func getInput(inputName string, required bool) string {
	input := os.Getenv(fmt.Sprintf("INPUT_%s", strings.ReplaceAll(strings.ToUpper(inputName), " ", "_")))
	if required && strings.TrimSpace(input) == "" {
		panic(fmt.Sprintf("Input required and not supplied: %s", inputName))
	}
	return input
}

// Return the commit hash of the last workflow run in which the specified job was successful
// TODO @khongchai return the commit hash.
func getLastSuccessfulWorkflowRunCommit(ctx context.Context, client *github.Client, jobName string) {
	owner_repo := strings.Split(os.Getenv("GITHUB_REPOSITORY"), "/")
	owner := owner_repo[0]
	repo := owner_repo[1]
	previousWorkflowRuns, _, err := client.Actions.ListRepositoryWorkflowRuns(ctx, owner, repo, nil)
	if err != nil {
		fmt.Printf("Error getting workflow runs: %s", err)
		panic(err)
	}

	// just print all the workflow runs for now
	for _, run := range previousWorkflowRuns.WorkflowRuns {
		fmt.Printf("Workflow run: %d\n", *run.ID)
	}
}

func main() {
	ghClient := github.NewClient(nil)
	ctx := context.Background()

	input := getInput("paths", true)
	job := getInput("job", true)

	getLastSuccessfulWorkflowRunCommit(ctx, ghClient, job)

	// grab its hash
	// get the current commit hash
	// git diff to see the name of the files
	// see if the output of git diff contains the files that were changed

	fmt.Println("Test action")
	fmt.Printf("The input is %s", input)
}
