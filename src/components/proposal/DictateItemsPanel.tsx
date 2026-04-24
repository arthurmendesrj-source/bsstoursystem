import { useRef, useState } from "react";
import { Mic, Square, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ProposalItemKind } from "@/lib/proposal-totals";

export type DictatedItem = {
  kind: ProposalItemKind;
  description: string;
  city?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  item_date?: string | null;
  quantity: number;
  unit_cost: number;
  markup_pct: number;
};

type Props = {
  defaultMarkupPct: number;
  onItems: (items: DictatedItem[]) => void;
  onClose: () => void;
};

export function DictateItemsPanel({ defaultMarkupPct, onItems, onClose }: Props) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribe(blob);
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      toast.error(e?.message ?? "mic error");
    }
  };

  const stop = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
    }
  };

  const cancel = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setRecording(false);
    onClose();
  };

  const transcribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const audio_base64 = btoa(bin);

      const { data, error } = await supabase.functions.invoke("transcribe-proposal-items", {
        body: { audio_base64, mime_type: "audio/webm", default_markup_pct: defaultMarkupPct },
      });
      if (error) {
        const status = (error as any).context?.status;
        if (status === 429) toast.error("Rate limit — try again in a moment");
        else if (status === 402) toast.error("AI credits exhausted — add credits in workspace");
        else toast.error(error.message);
        return;
      }
      const items = (data?.items ?? []) as DictatedItem[];
      if (items.length === 0) {
        toast.message("Nothing detected in the audio");
        return;
      }
      onItems(items);
      toast.success(`+${items.length} items`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "transcribe error");
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="rounded-md border p-3 bg-muted/30 flex items-center gap-3 flex-wrap">
      {!recording && !transcribing && (
        <Button size="sm" onClick={start}>
          <Mic className="h-4 w-4 mr-1" /> {t("dictateItems")}
        </Button>
      )}
      {recording && (
        <>
          <span className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            {t("recording")}
          </span>
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="h-4 w-4 mr-1" /> {t("stopRecording")}
          </Button>
        </>
      )}
      {transcribing && (
        <span className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("transcribing")}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={cancel}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
