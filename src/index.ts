import * as core from "@actions/core";
import * as github from "@actions/github";

type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * As a result of rebasing, the run history of a branch may contain commits that are not present in the current branch.
 */
async function filterWorkflowRuns<T extends { head_sha: string }>({
  runs,
  oktokit,
  owner,
  repo,
  currentBranchName,
}: {
  runs: T[];
  oktokit: Octokit;
  owner: string;
  repo: string;
  currentBranchName: string;
}): Promise<T[]> {
  console.info("::group::Filtering workflow runs");

  const last100CommitsOfThisBranch = await oktokit.rest.repos.listCommits({
    owner,
    repo,
    sha: currentBranchName,
    per_page: 100,
    page: 1,
  });

  const sha = last100CommitsOfThisBranch.data.map((commit) => commit.sha);
  console.info("Last 100 commits of the current branch: ", sha.join(", "));
  const shaSet = new Set(sha);

  const filtered = runs.filter((run) => shaSet.has(run.head_sha));

  // if the current branch has no commits, return an empty string
  if (filtered.length === 0) {
    console.info("No commits found in the current branch after filtering");
  }

  console.info("::endgroup::");

  return filtered;
}

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
  console.info("::group::Getting current branch name");

  const eventName = ghEnv("GITHUB_EVENT_NAME");
  console.info("Event name is: ", eventName);
  if (eventName === "pull_request") {
    console.info("Event is pull request, returning GITHUB_HEAD_REF");
    const headRef = ghEnv("GITHUB_HEAD_REF");
    if (!headRef) {
      throw new Error("Could not get branch name from GITHUB_HEAD_REF");
    }
    return headRef;
  }

  console.info("Event is not pull request, returning GITHUB_REF");
  const ref = ghEnv("GITHUB_REF")?.replace("refs/heads/", "");
  if (!ref) {
    throw new Error("Could not get branch name from GITHUB_REF");
  }

  console.info("Current branch name: ", ref);

  console.info("::endgroup::");
  return ref;
}

async function handleWorkflowRunSha({
  octokit,
  owner,
  repo,
  currentBranchName,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  currentBranchName: string;
}): Promise<string> {
  const result = await octokit.rest.actions
    .listWorkflowRunsForRepo({
      owner,
      repo,
      status: "success",
      branch: currentBranchName,
      page: 1,
      per_page: 100,
    })
    .catch((e) => {
      throw new Error(`Error getting workflow runs: ${e}`);
    });

  const filteredWorkflowRuns = await filterWorkflowRuns({
    runs: result.data.workflow_runs,
    oktokit: octokit,
    owner,
    repo,
    currentBranchName,
  });

  if (filteredWorkflowRuns.length === 0) {
    console.info(
      "No successful workflow runs found, defaulting to empty string"
    );
    return "";
  }

  const sha = filteredWorkflowRuns[0].head_sha;
  console.info("Latest successful workflow run commit hash: ", sha);
  return sha;
}

async function handleJobSha({
  octokit,
  owner,
  repo,
  currentBranchName,
  jobName,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  currentBranchName: string;
  jobName: string;
}): Promise<string> {
  const previousCompletedWorkflowRuns = await octokit.rest.actions
    .listWorkflowRunsForRepo({
      owner,
      repo,
      branch: currentBranchName,
    })
    .catch((e) => {
      throw new Error(`Error getting workflow runs: ${e}`);
    });

  const filteredWorkflowRuns = await filterWorkflowRuns({
    runs: previousCompletedWorkflowRuns.data.workflow_runs,
    oktokit: octokit,
    owner,
    repo,
    currentBranchName,
  });
  // iterate the list of workflow from newest to oldest,
  // if the workflow run contains the specified job and it was successful, return the commit hash
  for (const workflowRun of filteredWorkflowRuns) {
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
    console.info(
      "::group::Checking all jobs in commit of hash: ",
      thisRunCommitHash
    );
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
        console.info("::endgroup::");
        return thisRunCommitHash;
      }
    }
  }

  // if this is the first ever run of the workflow, return an empty string
  console.info(
    "Unable to find the specified job in successful state in any of the previous workflow runs, defaulting to emtpy string"
  );
  console.info("::endgroup::");
  return "";
}

async function getSha(): Promise<string> {
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
  const useLatestSuccessfulWorkflowRun = !jobName;

  const token = core.getInput("token", {
    required: true,
  });

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const currentBranchName = getCurrentBranchName();

  console.info("Current branch name: " + currentBranchName);

  if (useLatestSuccessfulWorkflowRun) {
    return handleWorkflowRunSha({
      octokit,
      owner,
      repo,
      currentBranchName,
    });
  }

  return handleJobSha({
    octokit,
    owner,
    repo,
    currentBranchName,
    jobName,
  });
}

async function main() {
  console.info("Starting the action");

  const sha = await getSha();

  core.setOutput("sha", sha);

  console.info("Done");
}

main();
