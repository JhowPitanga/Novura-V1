import { MultiValuedBadgeInput } from '@/components/listings/MultiValuedBadgeInput';
import { RequiredLabel } from '@/components/listings/RequiredLabel';
import { StringSuggestInput } from '@/components/listings/StringSuggestInput';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

function isBooleanAttr(a: any): boolean {
  const hasValues = Array.isArray(a?.values) && a.values.length > 0;
  return (
    String(a?.value_type || '').toLowerCase() === 'boolean' ||
    (hasValues &&
      a.values.some((v: any) =>
        /^(yes|no|sim|não|nao|true|false)$/i.test(String(v?.id || v?.name || '')),
      ))
  );
}

interface EditListingAttributeFieldProps {
  meta: any;
  current: any;
  isRequired: boolean;
  onChange: (attr: any) => void;
}

export function EditListingAttributeField({
  meta,
  current,
  isRequired,
  onChange,
}: EditListingAttributeFieldProps) {
  const id = String(meta?.id || '');
  const name = String(meta?.name || id || 'Atributo');
  const hasValues = Array.isArray(meta?.values) && meta.values.length > 0;
  const tags = (meta?.tags || {}) as any;
  const isNA =
    String(current?.value_id || '') === '-1' && (current?.value_name ?? null) === null;
  const canNA = !isRequired && String(id).toUpperCase() !== 'SELLER_SKU';
  const isString = String(meta?.value_type || '').toLowerCase() === 'string';
  const isMulti =
    Array.isArray(tags) ?
      tags.includes('multivalued') || tags.includes('repeated')
    : !!(tags?.multivalued || tags?.repeated);

  if (isBooleanAttr(meta)) {
    const yesVal = hasValues
      ? (meta.values || []).find((v: any) =>
          /^(yes|sim|true)$/i.test(String(v?.id || v?.name || '')),
        )
      : null;
    const noVal = hasValues
      ? (meta.values || []).find((v: any) =>
          /^(no|não|nao|false)$/i.test(String(v?.id || v?.name || '')),
        )
      : null;
    const currentValue = (() => {
      const vid = String(current?.value_id || '').toLowerCase();
      const vname = String(current?.value_name || '').toLowerCase();
      if (/^(yes|sim|true)$/i.test(vid) || /^(yes|sim|true)$/i.test(vname)) return 'yes';
      if (/^(no|não|nao|false)$/i.test(vid) || /^(no|não|nao|false)$/i.test(vname)) return 'no';
      return '';
    })();

    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <RequiredLabel text={name} required={isRequired} />
        <ToggleGroup
          type="single"
          value={currentValue}
          className="mt-2"
          onValueChange={(val) => {
            if (!val) return;
            if (val === 'yes') {
              if (yesVal) {
                onChange({
                  id,
                  name,
                  value_id: String((yesVal as any)?.id || 'yes'),
                  value_name: String((yesVal as any)?.name || 'Sim'),
                });
              } else onChange({ id, name, value_name: 'Sim' });
            } else if (noVal) {
              onChange({
                id,
                name,
                value_id: String((noVal as any)?.id || 'no'),
                value_name: String((noVal as any)?.name || 'Não'),
              });
            } else onChange({ id, name, value_name: 'Não' });
          }}
        >
          <ToggleGroupItem
            value="yes"
            className="rounded-l-md border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white"
          >
            Sim
          </ToggleGroupItem>
          <ToggleGroupItem
            value="no"
            className="rounded-r-md border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white"
          >
            Não
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    );
  }

  if (String(meta?.value_type || '').toLowerCase() === 'number_unit') {
    const allowed = Array.isArray(meta?.allowed_units) ? meta.allowed_units : [];
    const defUnit = String(meta?.default_unit || '');
    const currNum =
      typeof current?.value_struct?.number === 'number'
        ? String(current.value_struct.number)
        : String(current?.value_name || '').split(' ')[0] || '';
    const currUnit =
      typeof current?.value_struct?.unit === 'string'
        ? String(current.value_struct.unit)
        : String(current?.value_name || '').split(' ')[1] || defUnit;

    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
        <RequiredLabel text={name} required={isRequired} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            type="number"
            value={currNum}
            placeholder="Valor"
            onChange={(e) => {
              const num = Number(e.target.value) || 0;
              const unit = currUnit || defUnit || String(allowed[0]?.id || allowed[0] || '');
              const vname = unit ? `${num} ${unit}` : String(num);
              onChange({ id, name, value_name: vname, value_struct: { number: num, unit } });
            }}
          />
          <Select
            value={String(currUnit || defUnit || '')}
            onValueChange={(val) => {
              const unit = String(val || defUnit || '');
              const num = Number(currNum) || 0;
              const vname = unit ? `${num} ${unit}` : String(num);
              onChange({ id, name, value_name: vname, value_struct: { number: num, unit } });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((u: any, idx: number) => {
                const uid = String(u?.id || u || idx);
                const uname = String(u?.name || u?.id || u || uid);
                return (
                  <SelectItem key={uid} value={uid}>
                    {uname}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (isString || (!hasValues && !isBooleanAttr(meta))) {
    const suggestions = (Array.isArray(meta?.values) ? meta.values : []).map((v: any) => ({
      id: String(v?.id || ''),
      name: String(v?.name || v?.value || v?.id || ''),
    }));

    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
        <RequiredLabel text={name} required={isRequired} />
        {isMulti ? (
          <MultiValuedBadgeInput
            id={id}
            name={name}
            current={current}
            suggestions={suggestions}
            disabled={isNA}
            onChange={onChange}
          />
        ) : (
          <StringSuggestInput
            id={id}
            name={name}
            current={current}
            suggestions={suggestions}
            disabled={isNA}
            onChange={onChange}
          />
        )}
        {canNA && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <Checkbox
              checked={isNA}
              onCheckedChange={(checked) => {
                if (checked) onChange({ id, name, value_id: '-1', value_name: null });
                else onChange({ id, name, value_name: '' });
              }}
            />
            Não se aplica
          </label>
        )}
      </div>
    );
  }

  if (hasValues) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
        <RequiredLabel text={name} required={isRequired} />
        <Select
          value={String(current?.value_id || '')}
          onValueChange={(val) => {
            const vname =
              meta.values.find((v: any) => String(v?.id || '') === String(val))?.name || '';
            onChange({ id, name, value_id: val, value_name: vname });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={name} />
          </SelectTrigger>
          <SelectContent>
            {meta.values.map((v: any) => (
              <SelectItem key={String(v?.id || v?.name)} value={String(v?.id || '')}>
                {String(v?.name || v?.value || v?.id || '')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
      <Label className="text-sm font-medium">{name}</Label>
      <StringSuggestInput
        id={id}
        name={name}
        current={current}
        suggestions={[]}
        onChange={onChange}
      />
    </div>
  );
}

export function splitAttrsByInputType(list: any[]) {
  const booleans: any[] = [];
  const others: any[] = [];
  for (const a of list) {
    if (isBooleanAttr(a)) booleans.push(a);
    else others.push(a);
  }
  return { booleans, others };
}
