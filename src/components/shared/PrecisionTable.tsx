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
            <div className="overflow-hidden border border-slate-200/60 rounded-[20px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_2px_4px_rgba(0,0,0,0.02)]">
                <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50/50">
                        <tr>
                            {columns.map((column, idx) => {
                                const isSorted = sortKey && column.sortKey === sortKey;
                                return (
                                    <th
                                        key={idx}
                                        scope="col"
                                        className={cn(
                                            "px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap",
                                            onSort && column.sortKey ? "cursor-pointer hover:text-slate-600 transition-colors" : "",
                                            column.className
                                        )}
                                        style={column.width ? { width: column.width } : undefined}
                                        onClick={() => (onSort && column.sortKey) ? onSort(column.sortKey) : undefined}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {column.header}
                                            {onSort && column.sortKey && (
                                                <div className={cn("flex flex-col opacity-0 group-hover:opacity-100 transition-opacity", isSorted && "opacity-100")}>
                                                    {isSorted && sortDir === 'asc' ? (
                                                        <ArrowUp size={10} strokeWidth={3} className="text-blue-600" />
                                                    ) : isSorted && sortDir === 'desc' ? (
                                                        <ArrowDown size={10} strokeWidth={3} className="text-blue-600" />
                                                    ) : (
                                                        <div className="w-[10px]" />
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
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                                        <span className="text-[13px] text-slate-400 font-medium">Refining data...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400 text-[13px]">
                                    No records found.
                                </td>
                            </tr>
                        ) : (
                            data.map((row) => (
                                <tr
                                    key={row.id}
                                    onClick={() => onRowClick?.(row)}
                                    className={cn(
                                        "group transition-colors",
                                        onRowClick ? "cursor-pointer hover:bg-slate-50/80" : ""
                                    )}
                                >
                                    {columns.map((column, idx) => (
                                        <td
                                            key={idx}
                                            className={cn(
                                                "px-4 py-3.5 text-[13px] text-slate-600 whitespace-nowrap",
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
