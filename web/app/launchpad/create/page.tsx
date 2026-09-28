import { PARAMS } from "@lancio/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { CreateForm } from "@/components/create/CreateForm";
import { Button, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Launch token",
  description: `Launch a token on Robinhood Chain: ${PARAMS.supply} supply, one curve, graduates at ${PARAMS.graduationEth} ETH, liquidity locked forever.`,
};

export default function CreatePage() {
  return (
    <div className="container-page py-6 md:py-10">
      <Button href="/" variant="outline" size="md" className="bg-surface pl-3.5">
        <ChevronLeft size={18} />
        Back
      </Button>
      <Card padded={false} className="mt-5 overflow-clip">
        <CreateForm />
      </Card>
    </div>
  );
}
