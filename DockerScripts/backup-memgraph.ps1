# ===================================================================
# backup-memgraph.ps1 - back up ONLY the Memgraph database.
#   .\backup-memgraph.ps1
# Thin wrapper around backup.ps1 -Service memgraph.
# Output: ./backup/memgraph_<yyyy-MM-dd_HHmmss>.tar.gz
# ===================================================================
& "$PSScriptRoot\backup.ps1" -Service memgraph
exit $LASTEXITCODE
