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

func main() {
	input := getInput("paths", true)
	// TODOs
	// get latest successful commit
	// grab its hash
	// get the current commit hash
	// git diff to see the name of the files
	// see if the output of git diff contains the files that were changed

	fmt.Println("Test action")
	fmt.Printf("The input is %s", input)
}
