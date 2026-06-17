import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface UnderConstructionProps {
  title: string;
  description?: string;
}

export function UnderConstruction({ title, description }: UnderConstructionProps) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center px-8 py-14 text-center">
        <div className="icon-tile-brand h-12 w-12">
          <Construction className="h-6 w-6 text-[#2e3192]" strokeWidth={1.5} />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
          Under construction
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          {description ??
            "This section is being built by the team. Check back in a future release."}
        </p>
      </CardContent>
    </Card>
  );
}
