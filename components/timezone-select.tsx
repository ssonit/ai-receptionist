"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  canonicalizeTimezone,
  findTimezoneOption,
  listTimezoneOptions,
} from "@/lib/timezones";
import { cn } from "@/lib/utils";

type TimezoneSelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  onValueChange?: (value: string) => void;
};

export function TimezoneSelect({
  id,
  name = "timezone",
  value: valueProp,
  defaultValue = "Asia/Ho_Chi_Minh",
  required,
  disabled,
  placeholder = "Search city or timezone…",
  className,
  triggerClassName,
  onValueChange,
}: TimezoneSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [uncontrolled, setUncontrolled] = React.useState(() =>
    canonicalizeTimezone(defaultValue),
  );
  const value = canonicalizeTimezone(valueProp ?? uncontrolled);
  const options = React.useMemo(() => listTimezoneOptions(), []);
  const selected = findTimezoneOption(value);

  function select(next: string) {
    const canonical = canonicalizeTimezone(next);
    if (valueProp === undefined) setUncontrolled(canonical);
    onValueChange?.(canonical);
    setOpen(false);
  }

  return (
    <div className={cn("w-full", className)}>
      <input name={name} required={required} type="hidden" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className={cn(
              "h-9 w-full justify-between font-normal",
              !value && "text-muted-foreground",
              triggerClassName,
            )}
            disabled={disabled}
            id={id}
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="truncate text-left">
              {selected?.label ?? value ?? placeholder}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>No timezone found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    keywords={opt.keywords}
                    onSelect={() => select(opt.value)}
                    value={`${opt.value} ${opt.label}`}
                  >
                    <CheckIcon
                      className={cn(
                        "size-4 shrink-0",
                        value === opt.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
