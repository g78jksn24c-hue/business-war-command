export const roles={admin:'主办方',ta:'助教',student:'学员'};
export const positions={boss:'老板',finance:'财务管理',staff:'员工'};
export function totals(persons,records){
 const sums=Object.fromEntries(persons.map(p=>[p.id,0]));
 for(const r of records)if(r.status==='approved')sums[r.person_id]=(sums[r.person_id]||0)+r.amount;
 return sums;
}
// All money is integer cents. Company balance always sums its current members.
export function settlement(companies,persons,records,event){
 const earned=totals(persons,records),rows=[];
 for(const company of companies){
  const members=persons.filter(p=>p.company_id===company.id&&p.active),total=members.reduce((n,p)=>n+earned[p.id],0);
  if(!members.length)continue;
  const groups=Object.keys(positions).map(position=>({position,people:members.filter(p=>p.position===position),weight:event[position]})).filter(g=>g.people.length);
  const denominator=groups.reduce((n,g)=>n+g.weight,0);
  if(!denominator)throw new Error('有成员的职位分配比例不能全为零');
  const parts=[];
  for(const group of groups){
   const positive=group.people.reduce((n,p)=>n+Math.max(0,earned[p.id]),0);
   for(const p of group.people){
    const personWeight=group.position==='staff'&&event.staff_mode==='weighted'&&positive?Math.max(0,earned[p.id])/positive:1/group.people.length;
    const exact=total*group.weight/denominator*personWeight;
    parts.push({personId:p.id,name:p.name,position:p.position,companyId:company.id,companyName:company.name,earned:earned[p.id],payout:Math.floor(exact),fraction:exact-Math.floor(exact)});
   }
  }
  let remainder=total-parts.reduce((n,p)=>n+p.payout,0);
  const ranked=[...parts].sort((a,b)=>b.fraction-a.fraction||a.personId.localeCompare(b.personId));
  for(let i=0;i<remainder;i++)ranked[i%ranked.length].payout++;
  rows.push(...parts.map(({fraction,...p})=>p));
 }
 return rows;
}
export function amountCents(value){
 const s=String(value);if(!/^\d{1,7}(\.\d{1,2})?$/.test(s))throw new Error('金额应为正数，最多两位小数');
 const cents=Math.round(Number(s)*100);if(cents<=0||cents>999999999)throw new Error('金额超出范围');return cents;
}
