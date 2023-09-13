# sh test-tag.sh

sh compile.sh

git add .

git commit -m "test tag"

git push 

git tag -d test

git tag test -m "Test tag"

git push origin test -f