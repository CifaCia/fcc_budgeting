import { supabase } from '@/lib/supabase';

export const updateLastUploadMetadata = async (userId: string, source: string, count: number) => {
  const metadata = {
    date: new Date().toISOString(),
    source,
    count,
  };

  await supabase
    .from('user_settings')
    .update({ last_upload: metadata })
    .eq('user_id', userId);
};
