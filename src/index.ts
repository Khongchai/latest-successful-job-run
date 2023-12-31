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
  core.info("::group::Filtering workflow runs");

  core.info(
    "Received successful workflow runs: " +
      runs.map((run) => run.head_sha).join(", ")
  );

  const last100CommitsOfThisBranch = await oktokit.rest.repos.listCommits({
    owner,
    repo,
    sha: currentBranchName,
    per_page: 100,
    page: 1,
  });

  const sha = last100CommitsOfThisBranch.data.map((commit) => commit.sha);
  core.info("Last 100 commits of the current branch: " + sha.join(", "));
  const shaSet = new Set(sha);

  const filtered = runs.filter((run) => shaSet.has(run.head_sha));

  // if the current branch has no commits, return an empty string
  if (filtered.length === 0) {
    core.info("No commits found in the current branch after filtering");
  }

  core.info("::endgroup::");

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
  core.info("::group::Getting current branch name");

  const eventName = ghEnv("GITHUB_EVENT_NAME");
  core.info("Event name is: " + eventName);
  if (eventName === "pull_request") {
    core.info("Event is pull request, returning GITHUB_HEAD_REF");
    const headRef = ghEnv("GITHUB_HEAD_REF");
    if (!headRef) {
      throw new Error("Could not get branch name from GITHUB_HEAD_REF");
    }
    return headRef;
  }

  core.info("Event is not pull request, returning GITHUB_REF");
  const ref = ghEnv("GITHUB_REF")?.replace("refs/heads/", "");
  if (!ref) {
    throw new Error("Could not get branch name from GITHUB_REF");
  }

  core.info("Current branch name: " + ref);

  core.info("::endgroup::");
  return ref;
}

async function listWorkflows(
  octokit: Octokit,
  args: (Omit<
    Parameters<Octokit["rest"]["actions"]["listWorkflowRuns"]>[0],
    "workflow_id"
  > & {
    workflow_id?: string | number;
  }) &
    Parameters<Octokit["rest"]["actions"]["listWorkflowRunsForRepo"]>[0]
) {
  const workflowId = args?.workflow_id;
  if (workflowId) {
    return await octokit.rest.actions.listWorkflowRuns({
      ...args,
      workflow_id: workflowId,
    });
  }

  return await octokit.rest.actions.listWorkflowRunsForRepo(args);
}

async function handleWorkflowRunSha({
  workflowId,
  octokit,
  owner,
  repo,
  currentBranchName,
}: {
  workflowId: string;
  octokit: Octokit;
  owner: string;
  repo: string;
  currentBranchName: string;
}): Promise<string> {
  const {
    data: { workflow_runs },
  } = await listWorkflows(octokit, {
    workflow_id: workflowId,
    owner,
    repo,
    status: "success",
    branch: currentBranchName,
    page: 1,
    per_page: 100,
  }).catch((e) => {
    throw new Error(`Error getting workflow runs: ${e}`);
  });

  const filteredWorkflowRuns = await filterWorkflowRuns({
    runs: workflow_runs,
    oktokit: octokit,
    owner,
    repo,
    currentBranchName,
  });

  if (filteredWorkflowRuns.length === 0) {
    core.info("No successful workflow runs found, defaulting to empty string");
    return "";
  }

  const sha = filteredWorkflowRuns[0].head_sha;
  core.info("Latest successful workflow run commit hash: " + sha);
  return sha;
}

async function handleJobSha({
  workflowId,
  octokit,
  owner,
  repo,
  currentBranchName,
  jobName,
}: {
  workflowId: string;
  octokit: Octokit;
  owner: string;
  repo: string;
  currentBranchName: string;
  jobName: string;
}): Promise<string> {
  const {
    data: { workflow_runs: workflowRuns },
  } = await listWorkflows(octokit, {
    workflow_id: workflowId,
    owner,
    repo,
    branch: currentBranchName,
  }).catch((e) => {
    throw new Error(`Error getting workflow runs: ${e}`);
  });

  const filteredWorkflowRuns = await filterWorkflowRuns({
    runs: workflowRuns,
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
    core.info(
      "::group::Checking all jobs in commit of hash: " + thisRunCommitHash
    );
    for (const job of workflowRunJobs.data.jobs) {
      core.info("Job name: " + job.name);
      core.info("Job status: " + job.status);
      core.info("Job conclusion: " + job.conclusion);

      if (
        job.name === jobName &&
        job.status === "completed" &&
        job.conclusion === "success"
      ) {
        core.info(
          "The hash of the latest commit in which the specified job was successful: " +
            thisRunCommitHash
        );
        core.info("::endgroup::");
        return thisRunCommitHash;
      }
    }
  }

  // if this is the first ever run of the workflow, return an empty string
  core.info(
    "Unable to find the specified job in successful state in any of the previous workflow runs, defaulting to emtpy string"
  );
  core.info("::endgroup::");
  return "";
}

async function getSha(): Promise<string> {
  const jobName = core.getInput("job", {
    required: false,
  });
  const workflowId = core.getInput("workflow_id", {
    required: false,
  });
  if (jobName) core.info("Job name provided: " + jobName);
  if (workflowId) core.info("Workflow id provided: " + workflowId);

  const useLatestSuccessfulWorkflowRun = !jobName;

  const token = core.getInput("token", {
    required: true,
  });

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const currentBranchName = getCurrentBranchName();

  core.info("Current branch name: " + currentBranchName);

  if (useLatestSuccessfulWorkflowRun) {
    return handleWorkflowRunSha({
      workflowId,
      octokit,
      owner,
      repo,
      currentBranchName,
    });
  }

  return handleJobSha({
    workflowId,
    octokit,
    owner,
    repo,
    currentBranchName,
    jobName,
  });
}

async function main() {
  core.info("Starting the action");

  const sha = await getSha();

  core.setOutput("sha", sha);

  core.info("Done");
}

main();
