import test from 'node:test';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('every browser module parses before deployment',()=>{
  const root=fileURLToPath(new URL('../public/',import.meta.url));
  for(const path of readdirSync(root,{recursive:true,encoding:'utf8'})){
    if(path.endsWith('.js'))execFileSync(process.execPath,['--check',path],{cwd:root});
  }
});
