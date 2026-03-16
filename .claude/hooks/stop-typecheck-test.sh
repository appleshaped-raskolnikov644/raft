#!/bin/bash
# Stop hook: runs tsc and bun test after Claude stops.
# Suppresses output on success to avoid triggering response loops.
# Only surfaces errors so Claude can fix them.

cd "${CLAUDE_PROJECT_DIR:-.}"

# Run typecheck
TSC_OUTPUT=$(bunx tsc --noEmit 2>&1)
TSC_EXIT=$?

# Run tests
TEST_OUTPUT=$(bun test 2>&1 | tail -12)
TEST_EXIT=$?

if [ $TSC_EXIT -ne 0 ] || [ $TEST_EXIT -ne 0 ]; then
  # Something failed: surface errors to Claude via additionalContext
  ERRORS=""
  if [ $TSC_EXIT -ne 0 ]; then
    ERRORS="TYPE ERRORS:\n${TSC_OUTPUT}\n\n"
  fi
  if [ $TEST_EXIT -ne 0 ]; then
    ERRORS="${ERRORS}TEST FAILURES:\n${TEST_OUTPUT}"
  fi

  # Escape for JSON
  ERRORS_JSON=$(echo -e "$ERRORS" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

  echo "{\"continue\": true, \"additionalContext\": ${ERRORS_JSON}}"
else
  # All good: suppress output so Claude doesn't respond and loop
  echo '{"continue": true, "suppressOutput": true}'
fi
