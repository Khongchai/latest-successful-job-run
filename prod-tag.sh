TAG_VERSION=$1

if [ -z "$TAG_VERSION" ]; then
  echo "Missing tag version after command"
  exit 1
fi

sh compile.sh

git add .

git commit -m "New tag $TAG_VERSION"

git push

git tag $TAG_VERSION -m "New tag $TAG_VERSION"
if [ $? -ne 0 ]; then
  echo "Tagging failed."
  exit 1
fi

git push origin $TAG_VERSION 

echo "Tagged $TAG_VERSION"
