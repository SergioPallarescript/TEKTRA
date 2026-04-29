import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import { openFile } from "@/lib/nativeMedia";

interface AttachmentThumbnailsProps {
  paths: string[];
}

const isImage = (path: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(path);

const getPublicUrl = (path: string) => {
  const { data } = supabase.storage.from("plans").getPublicUrl(path);
  return data.publicUrl;
};

const getSignedUrl = async (path: string) => {
  const { data } = await supabase.storage.from("plans").createSignedUrl(path, 3600);
  return data?.signedUrl || "";
};

const AttachmentThumbnails = ({ paths }: AttachmentThumbnailsProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsImage, setPreviewIsImage] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  if (!paths || paths.length === 0) return null;

  const handleClick = async (path: string) => {
    let url = signedUrls[path];
    if (!url) {
      url = await getSignedUrl(path);
      setSignedUrls((prev) => ({ ...prev, [path]: url }));
    }
    if (isImage(path)) {
      setPreviewIsImage(true);
      setPreviewUrl(url);
    } else {
      // Abre con visor del sistema en nativo, pestaña nueva en web
      const name = path.split("/").pop() || "documento";
      openFile(url, name).catch(() => window.open(url, "_blank"));
    }
  };

  const fileName = (path: string) => {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    // Remove timestamp prefix
    const clean = name.replace(/^\d+_/, "");
    return clean.length > 18 ? clean.slice(0, 15) + "..." : clean;
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {paths.map((path, i) =>
          isImage(path) ? (
            <button
              key={i}
              onClick={() => handleClick(path)}
              className="w-14 h-14 rounded border border-border overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer"
            >
              <ThumbnailImage path={path} />
            </button>
          ) : (
            <button
              key={i}
              onClick={() => handleClick(path)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer text-xs"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[100px]">{fileName(path)}</span>
            </button>
          )
        )}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-2">
          {previewUrl && previewIsImage && (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

// Sub-component for lazy-loaded thumbnail
const ThumbnailImage = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!url && !error) {
    getSignedUrl(path).then((u) => {
      if (u) setUrl(u);
      else setError(true);
    });
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (!url) {
    return <div className="w-full h-full animate-pulse bg-muted" />;
  }

  return (
    <img
      src={url}
      alt=""
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
};

export default AttachmentThumbnails;
