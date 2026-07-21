import fs from 'node:fs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const fail=message=>{console.error(`MAVIK instance: ${message}`);process.exitCode=1};

let instance;
let client;
let version;
try{instance=read('mavik.instance.json')}catch(error){fail(`mavik.instance.json invalide: ${error.message}`)}
try{client=read('client.config.json')}catch(error){fail(`client.config.json invalide: ${error.message}`)}
try{version=read('version.json')}catch(error){fail(`version.json invalide: ${error.message}`)}

if(instance&&client){
  if(instance.instanceId!==client.client?.id)fail('Identifiant client différent entre le manifeste et la configuration.');
  if(instance.coreVersion!==client.mavikCoreVersion)fail('Version de MAVIK Core incohérente.');
  if(instance.instanceVersion!==version?.version)fail('Version de l’instance incohérente avec version.json.');
  const declared=new Set(instance.extensions||[]);
  for(const extension of client.clientExtensions||[])if(!declared.has(extension))fail(`Extension absente du manifeste: ${extension}`);
  const serialized=JSON.stringify(client);
  if(/"pin"\s*:\s*"\d{4}"/.test(serialized))fail('Les codes personnels ne doivent jamais être enregistrés dans client.config.json.');
  if(/password|secret|token|api[_-]?key/i.test(serialized))fail('Une donnée pouvant être un secret est présente dans client.config.json.');
}

if(!process.exitCode)console.log(`Instance ${instance.instanceId} ${version.version} liée à MAVIK Core ${instance.coreVersion}.`);
