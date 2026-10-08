import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const config=sqliteTable('app_config',{key:text('key').primaryKey(),value:text('value').notNull()});
export const events=sqliteTable('events',{
 id:text('id').primaryKey(),name:text('name').notNull(),day:integer('day').notNull().default(1),
 revision:integer('revision').notNull().default(0),gate:text('gate').notNull().default(''),
 settled:integer('settled').notNull().default(0),snapshot:text('snapshot'),
 boss:integer('boss').notNull().default(30),finance:integer('finance').notNull().default(20),staff:integer('staff').notNull().default(50),
 staffMode:text('staff_mode').notNull().default('equal'),createdAt:text('created_at').notNull()
});
export const users=sqliteTable('users',{
 id:text('id').primaryKey(),name:text('name').notNull(),role:text('role').notNull(),eventId:text('event_id'),createdAt:text('created_at').notNull()
});
export const companies=sqliteTable('companies',{
 id:text('id').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),name:text('name').notNull(),note:text('note').notNull().default(''),createdAt:text('created_at').notNull()
},t=>[index('idx_companies_event').on(t.eventId)]);
export const persons=sqliteTable('persons',{
 id:text('id').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),name:text('name').notNull(),companyId:text('company_id').references(()=>companies.id),
 position:text('position').notNull().default('staff'),active:integer('active').notNull().default(1),userId:text('user_id'),createdAt:text('created_at').notNull()
},t=>[index('idx_persons_event_company').on(t.eventId,t.companyId),uniqueIndex('idx_persons_event_user').on(t.eventId,t.userId)]);
export const records=sqliteTable('records',{
 id:text('id').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),personId:text('person_id').notNull().references(()=>persons.id),
 day:integer('day').notNull(),amount:integer('amount').notNull(),category:text('category').notNull(),note:text('note').notNull().default(''),
 status:text('status').notNull().default('pending'),submitBy:text('submit_by').notNull(),submitAt:text('submit_at').notNull(),
 reviewBy:text('review_by'),reviewAt:text('review_at'),rejectReason:text('reject_reason').notNull().default(''),requestId:text('request_id').notNull()
},t=>[index('idx_records_event_status').on(t.eventId,t.status),index('idx_records_person_day').on(t.personId,t.day),uniqueIndex('idx_records_request').on(t.submitBy,t.requestId)]);
export const invites=sqliteTable('invites',{
 hash:text('hash').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),role:text('role').notNull(),personId:text('person_id').references(()=>persons.id),
 expiresAt:text('expires_at').notNull(),consumedBy:text('consumed_by'),createdAt:text('created_at').notNull()
},t=>[index('idx_invites_event').on(t.eventId)]);
export const audit=sqliteTable('audit',{
 id:text('id').primaryKey(),eventId:text('event_id').notNull(),userId:text('user_id').notNull(),action:text('action').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull()
},t=>[index('idx_audit_event').on(t.eventId)]);
export const accounts=sqliteTable('accounts',{
 id:text('id').primaryKey(),username:text('username').notNull(),passwordHash:text('password_hash').notNull(),salt:text('salt').notNull(),createdAt:text('created_at').notNull()
},t=>[uniqueIndex('idx_accounts_username').on(t.username)]);
export const sessions=sqliteTable('sessions',{
 tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id),expiresAt:text('expires_at').notNull()
},t=>[index('idx_sessions_account').on(t.accountId)]);
export const attempts=sqliteTable('auth_attempts',{
 key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()
});
