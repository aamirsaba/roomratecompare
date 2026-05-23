@echo off
cd C:\roomratecompare
node src/prepopulateCache.js
echo Prepopulation completed at %date% %time% >> prepopulate_log.txt