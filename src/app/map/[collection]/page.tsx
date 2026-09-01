import { CollectionMap } from "@/components/map/CollectionMap";

export default async function CollectionPage(props: {
  params: Promise<{ collection: string }>;
}) {
  const { collection } = await props.params;
  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      <CollectionMap slug={collection} />
    </div>
  );
}
