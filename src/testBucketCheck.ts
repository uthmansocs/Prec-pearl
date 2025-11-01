import { supabase } from "@/integrations/supabase/client";

async function checkBuckets() {
  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    console.error("❌ Error listing buckets:", error.message);
  } else {
    console.log("✅ Buckets found in this Supabase project:");
    data?.forEach((bucket: any) => {
      console.log(`- ${bucket.name}`);
    });
  }
}

checkBuckets();
