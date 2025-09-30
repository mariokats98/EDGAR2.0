// app/components/SectionHeader.tsx
"use client";
import React from "react";

export default function SectionHeader({
  title,
  subtitle,
  icon,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        {icon && <span aria-hidden className="text-xl">{icon}</span>}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {subtitle ? (
        <p className="hidden sm:block text-sm text-gray-500">{subtitle}</p>
      ) : null}
    </div>
  );
}