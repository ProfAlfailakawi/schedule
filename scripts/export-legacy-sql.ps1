param(
  [Parameter(Mandatory = $true)]
  [string]$ConnectionString,

  [string]$OutputPath = ".\legacy-export.json"
)

$ErrorActionPreference = "Stop"

# This script is intentionally run only against an isolated restore/read-only copy
# of the legacy SQL Server database. It never writes to SQL Server.
$activeMap = [ordered]@{
  "SystemUser"            = "users"
  "FormName"              = "formNames"
  "FormSecurity"          = "formSecurity"
  "AdCollegeUserAssign"   = "collegeUserAssign"
  "AdTerm"                = "terms"
  "AdCollege"             = "colleges"
  "AdSection"             = "sections"
  "AdInstructor"          = "instructors"
  "AdCourse"              = "courses"
  "FSchedule"             = "schedules"
  "AdRoom"                = "rooms"
}

function Convert-DbValue($value) {
  if ($null -eq $value -or $value -is [System.DBNull]) { return $null }
  if ($value -is [byte[]]) { return [Convert]::ToBase64String($value) }
  if ($value -is [DateTime]) { return $value.ToString("o") }
  if ($value -is [TimeSpan]) { return $value.ToString() }
  return $value
}

function Quote-SqlIdentifier([string]$name) {
  return "[" + $name.Replace("]", "]]" ) + "]"
}

function Read-TableRows($connection, [string]$schemaName, [string]$tableName) {
  $cmd = $connection.CreateCommand()
  $cmd.CommandText = "SELECT * FROM " + (Quote-SqlIdentifier $schemaName) + "." + (Quote-SqlIdentifier $tableName)
  $reader = $cmd.ExecuteReader()
  $table = New-Object System.Data.DataTable
  $table.Load($reader)
  $rows = @()
  foreach ($row in $table.Rows) {
    $obj = [ordered]@{}
    foreach ($column in $table.Columns) {
      $obj[$column.ColumnName] = Convert-DbValue $row[$column.ColumnName]
    }
    $rows += [pscustomobject]$obj
  }
  return ,$rows
}

$connection = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
try {
  $connection.Open()

  $listCmd = $connection.CreateCommand()
  $listCmd.CommandText = @"
SELECT s.name AS SchemaName, t.name AS TableName
FROM sys.tables AS t
INNER JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE t.is_ms_shipped = 0
ORDER BY CASE WHEN s.name = 'dbo' THEN 0 ELSE 1 END, s.name, t.name;
"@
  $reader = $listCmd.ExecuteReader()
  $tableList = New-Object System.Data.DataTable
  $tableList.Load($reader)

  $result = [ordered]@{}
  foreach ($targetName in $activeMap.Values) { $result[$targetName] = @() }
  $legacyArchive = [ordered]@{}
  $foundActive = @{}

  foreach ($tableRow in $tableList.Rows) {
    $schema = [string]$tableRow["SchemaName"]
    $table = [string]$tableRow["TableName"]
    $rows = Read-TableRows $connection $schema $table

    if ($activeMap.Contains($table) -and -not $foundActive.ContainsKey($table)) {
      $result[$activeMap[$table]] = $rows
      $foundActive[$table] = $true
      Write-Host ("Active table {0}.{1}: {2} rows" -f $schema, $table, $rows.Count)
    }
    else {
      $archiveKey = if ($schema -eq "dbo") { $table } else { "$schema.$table" }
      $legacyArchive[$archiveKey] = $rows
      Write-Host ("Archive table {0}.{1}: {2} rows" -f $schema, $table, $rows.Count)
    }
  }

  $result["legacyArchive"] = $legacyArchive
  $json = [pscustomobject]$result | ConvertTo-Json -Depth 100 -Compress:$false
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $json, $utf8NoBom)

  foreach ($sourceTable in $activeMap.Keys) {
    if (-not $foundActive.ContainsKey($sourceTable)) {
      Write-Warning "Legacy active table '$sourceTable' was not found; its exported array is empty. Review before migration."
    }
  }
  Write-Host "Export complete: $([System.IO.Path]::GetFullPath($OutputPath))"
}
finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
  $connection.Dispose()
}
