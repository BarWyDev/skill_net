import { FieldError } from "@/components/auth/FieldError";
import { cn } from "@/lib/utils";
import type { SkillCategoryDTO, SkillDTO, SkillLevel } from "@/types";

export const LEVEL_LABELS: Record<SkillLevel, string> = {
  1: "Podstawowy kurs",
  2: "Praktyk",
  3: "Profesjonalista",
};
const LEVELS: SkillLevel[] = [1, 2, 3];

/** Checked skills, keyed by slug; the value is the chosen level (null until chosen or for no-level skills). */
export type SelectedSkills = Record<string, SkillLevel | null>;

interface Props {
  categories: SkillCategoryDTO[];
  skills: SkillDTO[];
  selected: SelectedSkills;
  showMissingLevels: boolean;
  onToggle: (slug: string, checked: boolean) => void;
  onLevel: (slug: string, level: SkillLevel) => void;
}

// A quiet toggle list: each category is a fieldset, each skill a square checkbox that fills with the
// signal accent. A checked skill with levels opens its level radios on a full-width row underneath.
export function SkillsPicker({ categories, skills, selected, showMissingLevels, onToggle, onLevel }: Props) {
  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <fieldset key={category.slug} className="min-w-0">
          <legend className="mb-2 font-bold">{category.name}</legend>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {skills
              .filter((skill) => skill.categorySlug === category.slug)
              .map((skill) => {
                const checked = skill.slug in selected;
                const level = selected[skill.slug] ?? null;
                const missingLevel = showMissingLevels && checked && skill.hasLevel && level === null;
                const withLevels = checked && skill.hasLevel;
                return (
                  <li key={skill.slug} className={cn(withLevels && "sm:col-span-2")}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-4 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          onToggle(skill.slug, e.target.checked);
                        }}
                        className="check"
                      />
                      <span className={cn(checked ? "text-chalk" : "text-ash")}>{skill.name}</span>
                    </label>

                    {withLevels && (
                      <fieldset
                        id={`level-${skill.slug}`}
                        aria-describedby={missingLevel ? `level-${skill.slug}-error` : undefined}
                        className={cn("mb-3 ml-3 border-l-2 pl-7", missingLevel ? "border-alarm" : "border-seam")}
                      >
                        <legend className="sr-only">Poziom: {skill.name}</legend>
                        <div className="flex flex-wrap gap-x-6">
                          {LEVELS.map((value) => (
                            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
                              <input
                                type="radio"
                                name={`level-${skill.slug}`}
                                checked={level === value}
                                aria-invalid={missingLevel || undefined}
                                onChange={() => {
                                  onLevel(skill.slug, value);
                                }}
                                className="radio"
                              />
                              <span className="text-[0.9375rem]">{LEVEL_LABELS[value]}</span>
                            </label>
                          ))}
                        </div>
                        {missingLevel && <FieldError id={`level-${skill.slug}-error`}>Wybierz poziom.</FieldError>}
                      </fieldset>
                    )}
                  </li>
                );
              })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
