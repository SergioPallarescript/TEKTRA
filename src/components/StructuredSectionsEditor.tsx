import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface StructuredSectionField {
  key: string;
  label: string;
  placeholder: string;
}

interface StructuredSectionsEditorProps {
  fields: StructuredSectionField[];
  title?: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

const StructuredSectionsEditor = ({ fields, title = "Vista previa editable", values, onChange }: StructuredSectionsEditorProps) => {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{title}</p>
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            {field.label}
          </Label>
          <Textarea
            value={values[field.key] || ""}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="bg-background"
          />
        </div>
      ))}
    </div>
  );
};

export default StructuredSectionsEditor;