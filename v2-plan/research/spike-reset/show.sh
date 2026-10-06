#!/bin/zsh
# usage: show.sh <name>  — condensed view of the stream and the mod log
D=${0:A:h}
echo "--- stream"; jq -c 'if .type=="system" then {t:.type,s:.subtype,plugins:(.plugins//null|if .==null then null else map(.name) end),meta:(.compact_metadata//null)} elif .type=="assistant" then {t:"assistant",c:[.message.content[]|(.text//.name//.type)],u:.message.usage|{i:.input_tokens,cr:.cache_read_input_tokens,cc:.cache_creation_input_tokens,o:.output_tokens}} elif .type=="user" then {t:"user",c:(.message.content|if type=="string" then .[0:300] else map(.text//.content//.type|tostring|.[0:300]) end)} elif .type=="result" then {t:"result",s:.subtype,turns:.num_turns,cost:.total_cost_usd,result:.result,usage:.usage|{i:.input_tokens,cr:.cache_read_input_tokens,cc:.cache_creation_input_tokens,o:.output_tokens},models:(.modelUsage|keys)} else {t:.type} end' $D/logs/$1.stream.jsonl
echo "--- mod"; jq -c '{w:.what,d:.data}' $D/logs/$1.mod.jsonl
echo "--- stderr"; head -20 $D/logs/$1.stderr
