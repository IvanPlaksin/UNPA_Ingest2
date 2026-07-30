# ===================================================================
# backup-redis.ps1 - back up ONLY the Redis database.
#   .\backup-redis.ps1
# Thin wrapper around backup.ps1 -Service redis.
# Output: ./backup/redis_<yyyy-MM-dd_HHmmss>.tar.gz
# ===================================================================
& "$PSScriptRoot\backup.ps1" -Service redis
exit $LASTEXITCODE
