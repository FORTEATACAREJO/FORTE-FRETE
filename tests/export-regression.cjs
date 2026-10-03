const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 let saved;const rows={motoristas:[{id:'m',cpf:'52998224725',nome:'Teste',auth_user_id:'PRIVATE_AUTH_ID',analisado_por:'PRIVATE_ADMIN_ID'}],documentos_motorista:[{id:'d',motorista_id:'m',tipo:'cnh_frente',arquivo_path:'private/path.pdf'}]};
 const client={from:table=>({select(){return this},order(){return this},range:async()=>({data:rows[table]||[],error:null})}),storage:{from:()=>({download:async()=>({data:new Blob(['documento-teste'],{type:'application/pdf'}),error:null})})}};
 const ctx={Blob,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),URL:{createObjectURL:blob=>(saved=blob,'blob:test'),revokeObjectURL(){}},document:{createElement:()=>({click(){}})},setTimeout(){},console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('export-cadastros.js','utf8').replaceAll('export ',''),ctx);
 const summary=await ctx.exportCadastros(client);assert.equal(summary.motoristas,1);assert.equal(summary.anexos,1);
 const text=await saved.text(),data=JSON.parse(text);assert.equal(data.formato,'cadastros_transporte');assert.equal(data.versao,1);
 for(const privateValue of ['PRIVATE_AUTH_ID','PRIVATE_ADMIN_ID','private/path.pdf','access_token','password'])assert.ok(!text.includes(privateValue));
 assert.equal(Buffer.from(data.anexos[0].base64,'base64').toString(),'documento-teste');
 client.storage.from=()=>({download:async()=>({data:null,error:new Error('missing')})});await assert.rejects(()=>ctx.exportCadastros(client),/exportação foi interrompida/);
 console.log('PASS: full cadastral file includes document bytes; authentication fields excluded; missing document aborts export.');
})().catch(e=>{console.error(e);process.exit(1)});
