import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {startNotifications} from '/forte-notifications.js';
const client=createClient('https://nkynfboqwfxhhxcsrawl.supabase.co','sb_publishable_7nIQ1MbqxonXl6cZqlP3IA_CK-gVLf9',{auth:{storage:localStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
startNotifications({client,app:'frete',bridge:true});
