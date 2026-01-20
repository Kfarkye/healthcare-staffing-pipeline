import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Column<T> {
    header: string;
    accessor: keyof T | ((row: T) => React.ReactNode);
    className?: string;
    width?: string;
    sortKey?: string;
}

interface PrecisionTableProps<T> {
    data: T[];
    columns: Column<T>[];
    onRowClick?: (row: T) => void;
    onSort?: (key: string) => void;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    isLoading?: boolean;
    className?: string;
}

export function PrecisionTable<T extends { id: string | number }>({
    data,
    columns,
    onRowClick,
    onSort,
    sortKey,
    sortDir,
    isLoading,
    className
}: PrecisionTableProps<T>): JSX.Element {
    return (
        <div className={cn("inline-block min-w-full align-middle", className)}>
            <div className="radiant-card overflow-hidden">
                <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-[#F9F9FB]">
                        <tr>
                            {columns.map((column, idx) => {
                                const isSorted = sortKey && column.sortKey === sortKey;
                                return (
                                    <th
                                        key={idx}
                                        scope="col"
                                        className={cn(
                                            "px-6 py-4 text-left editorial-caption whitespace-nowrap",
                                            onSort && column.sortKey ? "cursor-pointer hover:text-slate-900 transition-colors" : "",
                                            column.className
                                        )}
                                        style={column.width ? { width: column.width } : undefined}
                                        onClick={() => (onSort && column.sortKey) ? onSort(column.sortKey) : undefined}
                                    >
                                        <div className="flex items-center gap-2">
                                            {column.header}
                                            {onSort && column.sortKey && (
                                                <div className={cn("flex flex-col opacity-0 group-hover:opacity-100 transition-all duration-200", isSorted && "opacity-100")}>
                                                    {isSorted && sortDir === 'asc' ? (
                                                        <ArrowUp size={11} strokeWidth={3} className="text-blue-600" />
                                                    ) : isSorted && sortDir === 'desc' ? (
                                                        <ArrowDown size={11} strokeWidth={3} className="text-blue-600" />
                                                    ) : (
                                                        <ArrowUp size={11} strokeWidth={3} className="text-slate-200" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {columns.map((_, idx) => (
                                        <td key={idx} className="px-6 py-5">
                                            <div className="h-4 bg-slate-100 rounded-full w-24" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="editorial-caption text-slate-300">No signals found</div>
                                        <p className="text-[13px] text-slate-400 font-medium">Try broadening your search criteria.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((row) => (
                                <tr
                                    key={row.id}
                                    onClick={() => onRowClick?.(row)}
                                    className={cn(
                                        "group transition-all duration-200",
                                        onRowClick ? "cursor-pointer hover:bg-slate-50/50 hover:translate-x-0.5" : ""
                                    )}
                                >
                                    {columns.map((column, idx) => (
                                        <td
                                            key={idx}
                                            className={cn(
                                                "px-6 py-5 text-[13px] text-slate-600 font-medium whitespace-nowrap tabular-nums tracking-tight",
                                                column.className
                                            )}
                                        >
                                            {typeof column.accessor === 'function'
                                                ? column.accessor(row)
                                                : (row[column.accessor] as React.ReactNode)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
