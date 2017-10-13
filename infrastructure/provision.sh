#!/bin/sh

SOURCE_BRANCH=$1
GITHUB_OAUTH_TOKEN=$2

PARAMETER_OVERRIDES=""
if [[ ! -z "$SOURCE_BRANCH" ]] || [[ ! -z "$GITHUB_OAUTH_TOKEN" ]]; then
  PARAMETER_OVERRIDES="--parameter-overrides "
fi
if [[ ! -z "$SOURCE_BRANCH" ]]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES SourceBranch=$SOURCE_BRANCH "
fi
if [[ ! -z "$GITHUB_OAUTH_TOKEN" ]]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES GitHubOAuthToken=$GITHUB_OAUTH_TOKEN "
fi

PIPELINE_STACK_NAME="rds-backup-pipeline"
TEMPLATE_PATH="./pipeline.yaml"

aws cloudformation deploy \
  --stack-name $PIPELINE_STACK_NAME \
  --template-file $TEMPLATE_PATH \
  --capabilities CAPABILITY_IAM \
  $PARAMETER_OVERRIDES

aws cloudformation describe-stacks \
  --stack-name $PIPELINE_STACK_NAME
