export function inviteActor(profile,driver){
 const active=Boolean(profile?.ativo&&profile.status_aprovacao==='APROVADO'&&!profile.trocar_senha);
 if(active&&['MASTER','ADMINISTRADOR'].includes(profile.perfil))return {admin:true,driverId:null};
 if(active&&profile.perfil==='MOTORISTA'&&driver?.id&&driver?.status_cadastro==='aprovado'&&driver.auth_user_id===profile.user_id)return {admin:false,driverId:driver.id};
 return null;
}
export function canSendInvite(actor,invite){return Boolean(actor&&(actor.admin||actor.driverId&&actor.driverId===invite?.criado_por_motorista_id));}
