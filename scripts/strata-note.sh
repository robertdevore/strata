#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# strata-note — CLI helper for creating/updating Strata notes from any agent
# =============================================================================
#
# Usage:
#   strata-note create "content" [--tags tag1,tag2] [--starred] [--archived]
#   strata-note create --title "Title" --body "Markdown body" [--tags tag1,tag2]
#   strata-note upsert "query" "content" [--tags tag1,tag2]
#   strata-note get <id>
#   strata-note list [--query "search"] [--tag "tag"]
#   strata-note read-stdin [--tags tag1,tag2]
#   strata-note health
#
# Environment:
#   STRATA_API_BASE_URL   (default: http://127.0.0.1:3939)
#   STRATA_API_TOKEN      optional auth token
#
# Examples (perfect for AI agents):
#   strata-note create "## Code Review: ruff-eval\n\n- Found 3 issues\n- Fixed 2"
#   strata-note create --title "Project Summary" --body "Details here..." --tags dev,review
#   echo "## Notes\n\nSome content" | strata-note read-stdin --tags automation
# =============================================================================

BASE_URL="${STRATA_API_BASE_URL:-http://127.0.0.1:3939}"
TOKEN="${STRATA_API_TOKEN:-}"

# Token auth args function — avoids nounset issues with empty arrays
curl_auth_args() {
	if [[ -n "$TOKEN" ]]; then
		echo "-H" "X-Strata-Token: $TOKEN"
	fi
}

# ---- helpers ----

usage() {
	cat <<'EOF'
Usage:
  strata-note create <content> [--tags tag1,tag2] [--starred] [--archived]
  strata-note create --title "Title" --body "Markdown" [--tags tag1,tag2] [--starred]
  strata-note upsert <query> <content> [--tags tag1,tag2]
  strata-note get <id>
  strata-note list [--query "search"] [--tag "tag"]
  strata-note read-stdin [--tags tag1,tag2] [--starred]
  strata-note health

Environment:
  STRATA_API_BASE_URL   API base URL (default: http://127.0.0.1:3939)
  STRATA_API_TOKEN      Optional auth token
EOF
}

api_call() {
	local method="$1"
	local path="$2"
	local body="${3:-}"
	local curl_args=(-sS -X "$method")
	if [[ -n "$TOKEN" ]]; then
		curl_args+=(-H "X-Strata-Token: $TOKEN")
	fi
	if [[ -n "$body" ]]; then
		curl_args+=(-H "Content-Type: application/json" -d "$body")
	fi
	curl "${curl_args[@]}" "$BASE_URL$path"
}

build_content() {
	local title="${1:-}"
	local body="${2:-}"
	if [[ -n "$title" && -n "$body" ]]; then
		printf '# %s\n\n%s' "$title" "$body"
	elif [[ -n "$title" ]]; then
		printf '# %s\n\n' "$title"
	elif [[ -n "$body" ]]; then
		printf '%s' "$body"
	else
		printf '# Untitled\n\n'
	fi
}

parse_tags() {
	local raw="$1"
	if [[ -z "$raw" ]]; then
		echo '[]'
		return
	fi
	local json='['
	local first=true
	local IFS=','
	for tag in $raw; do
		# trim whitespace
		tag="${tag#"${tag%%[![:space:]]*}"}"
		tag="${tag%"${tag##*[![:space:]]}"}"
		if [[ -n "$tag" ]]; then
			if $first; then
				first=false
			else
				json+=','
			fi
			# escape double quotes in tag
			local escaped="${tag//\"/\\\"}"
			json+="\"$escaped\""
		fi
	done
	json+=']'
	echo "$json"
}

extract_note_id() {
	# Extract note.id from JSON response
	echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('note',{}).get('id',''))" 2>/dev/null || true
}

print_result() {
	local response="$1"
	# Pretty-print if python3 is available
	if command -v python3 &>/dev/null; then
		echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
	else
		echo "$response"
	fi
}

# ---- commands ----

cmd_health() {
	api_call GET /health
	echo
}

cmd_list() {
	local query_string=""
	local has_param=false

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--query)
				if $has_param; then query_string+='&'; fi
				query_string+="query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$2'))" 2>/dev/null || echo "$2")"
				has_param=true
				shift 2
				;;
			--tag)
				if $has_param; then query_string+='&'; fi
				query_string+="tag=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$2'))" 2>/dev/null || echo "$2")"
				has_param=true
				shift 2
				;;
			*)
				shift
				;;
		esac
	done

	local url="$BASE_URL/notes"
	if [[ -n "$query_string" ]]; then
		url+="?$query_string"
	fi
	if [[ -n "$TOKEN" ]]; then
		curl -sS -H "X-Strata-Token: $TOKEN" "$url"
	else
		curl -sS "$url"
	fi
	echo
}

cmd_get() {
	local id="$1"
	api_call GET "/notes/$id"
	echo
}

# build_json_body: uses python3 to safely construct JSON from content, tags, starred, archived.
# Reads content from stdin, takes tags_json, starred_str, archived_str as args.
build_json_body() {
	local tags_json="$1"
	local starred_str="$2"
	local archived_str="$3"
	python3 -c "
import sys, json
content = sys.stdin.read()
body = {
    'content': content,
    'tags': json.loads('$tags_json'),
    'starred': '$starred_str' == 'true',
    'archived': '$archived_str' == 'true'
}
print(json.dumps(body))
"
}

cmd_create() {
	local title=""
	local body=""
	local content_arg=""
	local tags_json='[]'
	local starred_str="false"
	local archived_str="false"

	# Parse: first positional might be direct content OR --title/--body
	if [[ $# -gt 0 && "$1" != --* ]]; then
		content_arg="$1"
		shift
	fi

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--title)
				title="$2"
				shift 2
				;;
			--body)
				body="$2"
				shift 2
				;;
			--tags)
				tags_json=$(parse_tags "$2")
				shift 2
				;;
			--starred)
				starred_str="true"
				shift
				;;
			--archived)
				archived_str="true"
				shift
				;;
			*)
				shift
				;;
		esac
	done

	local content
	if [[ -n "$content_arg" ]]; then
		content="$content_arg"
	else
		content=$(build_content "$title" "$body")
	fi

	local json_body
	json_body=$(echo "$content" | build_json_body "$tags_json" "$starred_str" "$archived_str")

	local response
	response=$(api_call POST /notes "$json_body")
	echo "$response"
	echo

	# Extract and return just the ID on a separate line for easy capture
	local note_id
	note_id=$(extract_note_id "$response")
	if [[ -n "$note_id" ]]; then
		echo "NOTE_ID=$note_id"
	fi
}

cmd_upsert() {
	local query="$1"
	local content="$2"
	shift 2 || true

	local tags_json='[]'
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--tags)
				tags_json=$(parse_tags "$2")
				shift 2
				;;
			*)
				shift
				;;
		esac
	done

	# Search for existing note
	local encoded_query
	encoded_query=$(echo "$query" | python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip()))" 2>/dev/null || echo "$query")
	local list_resp
	if [[ -n "$TOKEN" ]]; then
		list_resp=$(curl -sS -H "X-Strata-Token: $TOKEN" "$BASE_URL/notes?query=$encoded_query")
	else
		list_resp=$(curl -sS "$BASE_URL/notes?query=$encoded_query")
	fi

	# Extract first match ID
	local existing_id
	existing_id=$(echo "$list_resp" | python3 -c "import sys,json; notes=json.load(sys.stdin).get('notes',[]); print(notes[0]['id'] if notes else '')" 2>/dev/null || true)

	local json_body
	json_body=$(echo "$content" | build_json_body "$tags_json" "false" "false")

	if [[ -n "$existing_id" ]]; then
		# Update existing
		local response
		response=$(api_call PATCH "/notes/$existing_id" "$json_body")
		echo "$response"
		echo
		echo "NOTE_ID=$existing_id (updated)"
	else
		# Create new
		local response
		response=$(api_call POST /notes "$json_body")
		echo "$response"
		echo
		local note_id
		note_id=$(extract_note_id "$response")
		if [[ -n "$note_id" ]]; then
			echo "NOTE_ID=$note_id (created)"
		fi
	fi
}

cmd_read_stdin() {
	local tags_json='[]'
	local starred_str="false"
	local archived_str="false"

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--tags)
				tags_json=$(parse_tags "$2")
				shift 2
				;;
			--starred)
				starred_str="true"
				shift
				;;
			--archived)
				archived_str="true"
				shift
				;;
			*)
				shift
				;;
		esac
	done

	# Read all of stdin
	local content
	content=$(cat)

	if [[ -z "$content" ]]; then
		echo "Error: no content provided on stdin" >&2
		exit 1
	fi

	local json_body
	json_body=$(echo "$content" | build_json_body "$tags_json" "$starred_str" "$archived_str")

	local response
	response=$(api_call POST /notes "$json_body")
	echo "$response"
	echo

	local note_id
	note_id=$(extract_note_id "$response")
	if [[ -n "$note_id" ]]; then
		echo "NOTE_ID=$note_id"
	fi
}

# ---- main ----

if [[ $# -lt 1 ]]; then
	usage
	exit 1
fi

cmd="$1"
shift

case "$cmd" in
	health)
		cmd_health
		;;
	list)
		cmd_list "$@"
		;;
	get)
		cmd_get "$@"
		;;
	create)
		cmd_create "$@"
		;;
	upsert)
		cmd_upsert "$@"
		;;
	read-stdin)
		cmd_read_stdin "$@"
		;;
	-h|--help|help)
		usage
		;;
	*)
		echo "Unknown command: $cmd" >&2
		usage
		exit 1
		;;
esac
