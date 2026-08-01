import { getTranslations } from "next-intl/server";
import { PersonForm } from "@/components/person-form";

export default async function NewPersonPage() {
  const t = await getTranslations("persons");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("newPerson")}</h1>
      <PersonForm mode="create" requirements={[]} />
    </div>
  );
}
