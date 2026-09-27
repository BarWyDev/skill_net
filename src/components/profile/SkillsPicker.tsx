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

export function SkillsPicker({ categories, skills, selected, showMissingLevels, onToggle, onLevel }: Props) {
  return (
    <div className="space-y-4">
      {categories.map((category) => (
        <fieldset key={category.slug} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <legend className="px-1 text-sm font-semibold text-blue-100">{category.name}</legend>
          <ul className="space-y-3">
            {skills
              .filter((skill) => skill.categorySlug === category.slug)
              .map((skill) => {
                const checked = skill.slug in selected;
                const level = selected[skill.slug] ?? null;
                const missingLevel = showMissingLevels && checked && skill.hasLevel && level === null;
                return (
                  <li key={skill.slug}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          onToggle(skill.slug, e.target.checked);
                        }}
                        className="size-5 shrink-0 accent-purple-500"
                      />
                      <span className="text-white">{skill.name}</span>
                    </label>

                    {checked && skill.hasLevel && (
                      <fieldset
                        className={cn(
                          "mt-1 ml-8 rounded-lg border p-2",
                          missingLevel ? "border-red-400/70 bg-red-500/10" : "border-white/10",
                        )}
                      >
                        <legend className="px-1 text-xs text-blue-100/70">Poziom: {skill.name}</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {LEVELS.map((value) => (
                            <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name={`level-${skill.slug}`}
                                checked={level === value}
                                onChange={() => {
                                  onLevel(skill.slug, value);
                                }}
                                className="size-4 accent-purple-500"
                              />
                              <span className="text-blue-50">{LEVEL_LABELS[value]}</span>
                            </label>
                          ))}
                        </div>
                        {missingLevel && <p className="mt-1 text-xs text-red-300">Wybierz poziom.</p>}
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
