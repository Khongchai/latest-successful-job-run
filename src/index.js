// @ts-check

import * as core from "@actions/core";
import * as github from "@actions/github";

/**
 * @param {"GITHUB_EVENT_NAME" | "GITHUB_REF" | "GITHUB_HEAD_REF" | "GITHUB_OUTPUT" | "GITHUB_REPOSITORY"} key
 * @returns {string | undefined}
 */
function ghEnv(key) {
  return process.env[key];
}

/**
 * @returns {string}
 */
function getCurrentBranchName() {
  if (ghEnv("GITHUB_EVENT_NAME") === "pull_request") {
    console.info("Event is pull request, returning GITHUB_HEAD_REF");
    const headRef = ghEnv("GITHUB_HEAD_REF");
    if (!headRef) {
      throw new Error("Could not get branch name from GITHUB_HEAD_REF");
    }
    return headRef;
  }

  console.info("Event is not pull request, returning GITHUB_REF");
  const ref = ghEnv("GITHUB_REF")?.split("/")[2];
  if (!ref) {
    throw new Error("Could not get branch name from GITHUB_REF");
  }
  return ref;
}

async function getLastSuccessfulWorkflowRunCommit() {
  const jobName = core.getInput("job", {
    required: true,
  });
  const token = core.getInput("token", {
    required: true,
  });
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const currentBranchName = getCurrentBranchName();

  const previousCompletedWorkflowRuns = await octokit.rest.actions
    .listWorkflowRunsForRepo({
      owner,
      repo,
      status: "success",
      branch: currentBranchName,
    })
    .catch((e) => {
      throw new Error(`Error getting workflow runs: ${e}`);
    });

  // iterate the list of workflow from newest to oldest,
  // if the workflow run contains the specified job and it was successful, return the commit hash
  previousCompletedWorkflowRuns.data.workflow_runs.forEach(
    async (workflowRun) => {
      const workflowRunJobs = await octokit.rest.actions
        .listJobsForWorkflowRun({
          owner,
          repo,
          run_id: workflowRun.id,
        })
        .catch((e) => {
          throw new Error(`Error getting workflow run jobs: ${e}`);
        });

      const thisRunCommitHash = workflowRun.head_sha;
      console.info("Checking all jobs in commit of hash: ", thisRunCommitHash);
      for (const job of workflowRunJobs.data.jobs) {
        console.info("Job name: ", job.name);
        console.info("Job status: ", job.status);
        console.info("Job conclusion: ", job.conclusion);

        if (
          job.name === jobName &&
          job.status === "completed" &&
          job.conclusion === "success"
        ) {
          console.info(
            "The hash ov the latest commit in which the specified job was successful: ",
            thisRunCommitHash
          );
          return thisRunCommitHash;
        }
      }
    }
  );

  // if this is the first ever run of the workflow, return an empty string
  console.info(
    "Unable to find the specified job in successful state in any of the previous workflow runs, defaulting to emtpy string"
  );
  return "";
}

async function main() {
  console.info("Starting the action");

  const sha = await getLastSuccessfulWorkflowRunCommit();
  core.setOutput("sha", sha);

  console.info("Done");
}

main();
