// Numeric validation now runs the actual transactional SQL, not a duplicated JS formula.
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,['--test','tests/private-loads.test.cjs'],{stdio:'inherit'});
process.exit(result.status??1);
