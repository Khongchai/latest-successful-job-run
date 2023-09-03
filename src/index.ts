import * as core from "@actions/core";
import * as github from "@actions/github";

function ghEnv(
  key:
    | "GITHUB_EVENT_NAME"
    | "GITHUB_REF"
    | "GITHUB_HEAD_REF"
    | "GITHUB_OUTPUT"
    | "GITHUB_REPOSITORY"
): string | undefined {
  return process.env[key];
}

function getCurrentBranchName(): string {
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

function getJobName() {
  const jobName = core.getInput("job", {
    required: false,
  });
  if (!jobName) {
    console.info(
      "Job name not provied, checking for the commit hash of the latest successful workflow run instead"
    );
  } else {
    console.info(
      "Checking for the commit hash of the latest successful workflow run of job: ",
      jobName
    );
  }
  return jobName;
}

function getToken() {
  const token = core.getInput("token", {
    required: true,
  });
  console.info("Token: ", token);
  return token;
}

async function getLastSuccessfulWorkflowRunCommit() {
  const jobName = getJobName();
  const useLatestSuccessfulWorkflowRun = !jobName;
  const token = getToken();
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const currentBranchName = getCurrentBranchName();

  if (useLatestSuccessfulWorkflowRun) {
    const result = await octokit.rest.actions
      .listWorkflowRunsForRepo({
        owner,
        repo,
        status: "success",
        branch: currentBranchName,
        page: 1,
        per_page: 1,
      })
      .catch((e) => {
        throw new Error(`Error getting workflow runs: ${e}`);
      });

    if (result.data.workflow_runs.length === 0) {
      console.info(
        "No successful workflow runs found, defaulting to empty string"
      );
      return "";
    }

    const workflowRun = result.data.workflow_runs[0];
    console.info(
      "Latest successful workflow run commit hash: ",
      workflowRun.head_sha
    );
  }

  const previousCompletedWorkflowRuns = await octokit.rest.actions
    .listWorkflowRunsForRepo({
      owner,
      repo,
      status: "completed",
      branch: currentBranchName,
    })
    .catch((e) => {
      throw new Error(`Error getting workflow runs: ${e}`);
    });

  // iterate the list of workflow from newest to oldest,
  // if the workflow run contains the specified job and it was successful, return the commit hash
  for (const workflowRun of previousCompletedWorkflowRuns.data.workflow_runs) {
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
          "The hash of the latest commit in which the specified job was successful: ",
          thisRunCommitHash
        );
        return thisRunCommitHash;
      }
    }
  }

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
