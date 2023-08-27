package main

import (
	"fmt"
	"os"
	"strings"
)

// https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts
func getInput(inputName string, required bool) string {
	input := os.Getenv(fmt.Sprintf("INPUT_%s", strings.ReplaceAll(strings.ToUpper(inputName), " ", "_")))
	if required && strings.TrimSpace(input) == "" {
		panic(fmt.Sprintf("Input required and not supplied: %s", inputName))
	}
	return input
}

// Returns the commit hash of the latest successful workflow run.
func getLastSuccessfulWorkflowRun(ghToken string) string {

}

func main() {
	input := getInput("paths", true)
	ghToken := getInput("github_token", true)

	// TODOs
	// TODO @khongchai continue from here & use this
	// https://github.com/google/go-github & https://github.com/nrwl/last-successful-commit-action/blob/master/index.js &  https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28
	// get latest successful workflow runs
	latestSuccessfulWorkflowRunCommit := getLastSuccessfulWorkflowRun(ghToken)

	// grab its hash
	// get the current commit hash
	// git diff to see the name of the files
	// see if the output of git diff contains the files that were changed

	fmt.Println("Test action")
	fmt.Printf("The input is %s", input)
}
