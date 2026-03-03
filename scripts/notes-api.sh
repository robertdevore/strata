#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${STRATA_API_BASE_URL:-http://127.0.0.1:3939}"
TOKEN="${STRATA_API_TOKEN:-}"

usage() {
	cat <<'USAGE'
Usage:
	./scripts/notes-api.sh health
	./scripts/notes-api.sh list [query_string]
	./scripts/notes-api.sh get <note_id>
	./scripts/notes-api.sh create [json_body]
	./scripts/notes-api.sh update <note_id> <json_body>
	./scripts/notes-api.sh delete <note_id>

Environment:
	STRATA_API_BASE_URL   API base URL (default: http://127.0.0.1:3939)
	STRATA_API_TOKEN      Optional token for protected API

Examples:
	./scripts/notes-api.sh list
	./scripts/notes-api.sh list "query=todo&starred=true"
	./scripts/notes-api.sh create '{"content":"# Quick note","tags":["cli"]}'
	./scripts/notes-api.sh update 00000000-0000-0000-0000-000000000000 '{"starred":true}'
USAGE
}

auth_header_args=()
if [[ -n "$TOKEN" ]]; then
	auth_header_args=(-H "X-Strata-Token: $TOKEN")
fi

if [[ $# -lt 1 ]]; then
	usage
	exit 1
fi

command="$1"
shift

case "$command" in
	health)
		curl -sS "$BASE_URL/health"
		;;

	list)
		query_string="${1:-}"
		if [[ -n "$query_string" ]]; then
			curl -sS "${auth_header_args[@]}" "$BASE_URL/notes?$query_string"
		else
			curl -sS "${auth_header_args[@]}" "$BASE_URL/notes"
		fi
		;;

	get)
		if [[ $# -ne 1 ]]; then
			usage
			exit 1
		fi
		note_id="$1"
		curl -sS "${auth_header_args[@]}" "$BASE_URL/notes/$note_id"
		;;

	create)
		json_body="${1:-{}}"
		curl -sS -X POST "${auth_header_args[@]}" -H "Content-Type: application/json" "$BASE_URL/notes" -d "$json_body"
		;;

	update)
		if [[ $# -ne 2 ]]; then
			usage
			exit 1
		fi
		note_id="$1"
		json_body="$2"
		curl -sS -X PATCH "${auth_header_args[@]}" -H "Content-Type: application/json" "$BASE_URL/notes/$note_id" -d "$json_body"
		;;

	delete)
		if [[ $# -ne 1 ]]; then
			usage
			exit 1
		fi
		note_id="$1"
		curl -sS -X DELETE "${auth_header_args[@]}" "$BASE_URL/notes/$note_id"
		;;

	*)
		usage
		exit 1
		;;
esac

echo