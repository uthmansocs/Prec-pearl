import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const BUCKET = "report_uploads";

export default function CreateReportPage() {
  const { profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to make filename safe and unique
  const makeUniqueFilename = (originalName: string): string => {
    const timestamp = Date.now();
    const cleanName = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    return `${timestamp}_${cleanName}`;
  };

  // ✅ Fixed upload function
  const uploadFileAndResolveUrl = async (file: File): Promise<string> => {
    if (!file) throw new Error("No file selected.");
    if (!BUCKET) throw new Error("Bucket name not defined.");

    const path = makeUniqueFilename(file.name);

    console.debug("[Upload] Starting upload", { path, bucket: BUCKET });

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type ?? "application/octet-stream",
      });

    if (uploadError) {
      console.error("[Upload Error]", uploadError);
      const status = (uploadError as any)?.status;
      if (status === 401) throw new Error("Unauthorized: Please log in.");
      if (status === 403)
        throw new Error("Forbidden: Check your storage policies or bucket permissions.");
      if (status === 409)
        throw new Error("Conflict: File already exists. Rename or enable upsert.");
      throw new Error(uploadError.message || JSON.stringify(uploadError));
    }

    console.debug("[Upload Success]", uploadData);

    // Get public URL
    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = publicData?.publicUrl;
    if (publicUrl) return publicUrl;

    // Fallback: Signed URL
    const { data: signedData, error: signedErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (signedErr) throw new Error(signedErr.message);
    return signedData.signedUrl;
  };

  // Optional: Test upload button for debugging
  const runTestUpload = async () => {
    try {
      const blob = new Blob(["test"], { type: "text/plain" });
      const testFile = new File([blob], "upload-test.txt", { type: "text/plain" });
      const url = await uploadFileAndResolveUrl(testFile);
      console.log("✅ Test upload OK:", url);
      toast({ title: "Test upload OK", description: url });
    } catch (err: any) {
      console.error("❌ Test upload failed:", err);
      toast({ title: "Test upload failed", description: String(err?.message || err), variant: "destructive" });
    }
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ title: "Error", description: "Please select a file.", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const url = await uploadFileAndResolveUrl(file);
      setImageUrl(url);
      toast({ title: "Success", description: "Image uploaded successfully!" });
      console.log("✅ Final Image URL:", url);
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create Report</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="border p-2 rounded w-full"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {loading ? "Uploading..." : "Upload Image"}
        </button>
      </form>

      {imageUrl && (
        <div className="mt-6">
          <p className="text-sm text-gray-600">Uploaded Image:</p>
          <img src={imageUrl} alt="Uploaded" className="mt-2 rounded shadow-md max-h-64" />
        </div>
      )}

      {/* Optional test button */}
      <div className="mt-8">
        <button
          onClick={runTestUpload}
          className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
        >
          Run Test Upload
        </button>
      </div>
    </div>
  );
}
