# ===================================================================
# backup-qdrant.ps1 - back up ONLY the Qdrant vector database.
#   .\backup-qdrant.ps1
# Thin wrapper around backup.ps1 -Service qdrant.
# Output: ./backup/qdrant_<yyyy-MM-dd_HHmmss>.tar.gz
# ===================================================================
& "$PSScriptRoot\backup.ps1" -Service qdrant
exit $LASTEXITCODE
