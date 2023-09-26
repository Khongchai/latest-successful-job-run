# Latest Successful Job Run

This action returns the hash of the latest successful commit depending on the criteria you provide. It checks using a combination of three properties: `job`, `workflow_id`, and the workflow run.

## How it works

If nothing is provided, just return the latest successful workflow run.

If `workflow_id` is provided, return the commit hash of the latest successful workflow of `workflow_id` (the run may have failed, but the workflow of `e2e.yml` may have passed, for example).

If `job` is provided and `workflow_id` is not, return the commit hash of the latest successful job of `job`_(the name of your job, as appeared in github action console)_.

If both `job` and `workflow_id` are provided, return the commit hash of the latest successful job of `job` in the latest successful workflow of `workflow_id`. This is the most specific criteria.

If it finds nothing, it returns an empty string. 

# Inputs and Outputs

View the `action.yml` file at the root of this repo.

# Getting Started

Let's say you have two commits on your branch, `abc123` and `def456`. 

- Workflow of commit `abc123` is a failed workflow. It contains a successful job `My successful job`, but also a failed job `My failed job`,

- Workflow of Commit `def456` ran successfully with no errors.

There are two possible outcomes: 

## 1. Get the SHA of the commit of the latest successful **job** 

The following outputs `abc123` because in it, `My successful job` ran successfully, even though `My failed job` failed.

Required inputs are `job` and `token`.

```yaml
on: [push]

jobs:
  hello_world_job:
    runs-on: ubuntu-latest
    name: A job to test the input
    steps:
      - name: My successful job
        id: successful_job
        uses: khongchai/latest-successful-job-run@v2.1.0
        with:
          # `job` must be provided
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Print output from last step
        id: output_test
        # prints `abc123`
        run: echo "The output was ${{ steps.successful_job.outputs.sha }}"
  forced_failure_job:
    runs-on: ubuntu-latest
    name: My failed job
    steps:
      - name: Forced failure
        run: exit 1
```

## 1. Get the SHA of the commit of the latest successful **job** 

The following outputs `abc123` because in it, `My successful job` ran successfully, even though `My failed job` failed.

Required inputs are `job` and `token`.

```yaml
on: [push]

jobs:
  hello_world_job:
    runs-on: ubuntu-latest
    name: A job to test the input
    steps:
      - name: My successful job
        id: successful_job
        uses: khongchai/latest-successful-job-run@v2.1.0
        with:
          # `job` must be provided
          job: My successful job
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Print output from last step
        id: output_test
        # prints `abc123`
        run: echo "The output was ${{ steps.successful_job.outputs.sha }}"
  forced_failure_job:
    runs-on: ubuntu-latest
    name: My failed job
    steps:
      - name: Forced failure
        run: exit 1
```

## 2. Get the SHA of the commit of the latest successful job inside a particular workflow file.

This is the same as the previous step, but you can be more specific by saying which workflow file you want to look at.

```yaml
# my_workflow.yml

on: [push]

jobs:
  hello_world_job:
    runs-on: ubuntu-latest
    name: A job to test the input
    steps:
      - name: My successful job
        id: successful_job
        uses: khongchai/latest-successful-job-run@v2.1.0
        with:
          job: My successful job 
          workflow_id: my_workflow.yml
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Print output from last step
        id: output_test
        # prints `abc123`
        run: echo "The output was ${{ steps.successful_job.outputs.sha }}"
  forced_failure_job:
    runs-on: ubuntu-latest
    name: My failed job
    steps:
      - name: Forced failure
        run: exit 1
```

## 3. Get the SHA of the commit of the latest successful **workflow** run

The following outputs `def456` because it is the latest successful workflow run. 

By not passing in `job`, the action will return the latest successful workflow run.

```yaml
on: [push]

jobs:
  hello_world_job:
    runs-on: ubuntu-latest
    name: A job to test the input
    steps:
      - name: My successful job
        id: successful_job
        uses: khongchai/latest-successful-job-run@v2.1.0
        with:
          # provide just the token
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Print output from last step
        id: output_test
        # prints `def456`
        run: echo "The output was ${{ steps.successful_job.outputs.sha }}"
  forced_failure_job:
    runs-on: ubuntu-latest
    name: My failed job
    steps:
      - name: Forced failure
        run: exit 1
```



