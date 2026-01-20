import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  MouseSensor,
  TouchSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';

export interface DraggableItem {
  id: string;
  [key: string]: any;
}

export interface DraggableColumn {
  id: string;
  title: string;
  items: DraggableItem[];
  acceptsItemsFrom?: string[];
  className?: string;
}

interface DraggableBoardProps {
  columns: DraggableColumn[];
  onItemMove: (
    itemId: string,
    fromColumn: string,
    toColumn: string,
    item: DraggableItem
  ) => Promise<void>;
  renderCard: (item: DraggableItem, isDragging?: boolean) => React.ReactNode;
  renderColumn?: (column: DraggableColumn, children: React.ReactNode) => React.ReactNode;
  className?: string;
}

const SortableCard: React.FC<{
  item: DraggableItem;
  renderCard: (item: DraggableItem, isDragging?: boolean) => React.ReactNode;
}> = ({ item, renderCard }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'z-50' : ''}`}
    >
      {renderCard(item, isDragging)}
    </div>
  );
};

const DroppableColumn: React.FC<{
  column: DraggableColumn;
  children: React.ReactNode;
  isDropTarget?: boolean;
}> = ({ column, children, isDropTarget }) => {
  return (
    <div
      className={`
        flex-1 min-w-[320px] max-w-[400px] h-full
        ${isDropTarget ? 'bg-blue-50/20' : ''}
        transition-all duration-300 rounded-[28px]
      `}
    >
      <div className="flex flex-col h-full">
        <div className="px-6 py-5 flex items-center justify-between">
          <h3 className="editorial-caption text-slate-400">
            {column.title}
          </h3>
          <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full tabular-nums">
            {column.items.length}
          </span>
        </div>
        <div className="flex-1 px-3 pb-6 space-y-3 min-h-[300px] overflow-y-auto no-scrollbar scroll-smooth">
          {column.items.length === 0 ? (
            <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-100 rounded-[24px] py-16">
              <span className="editorial-caption text-slate-300">Drop here</span>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
};

export const DraggableBoard: React.FC<DraggableBoardProps> = ({
  columns,
  onItemMove,
  renderCard,
  renderColumn,
  className = '',
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? over.id as string : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      setOverId(null);
      return;
    }

    const activeItem = columns
      .flatMap(col => col.items)
      .find(item => item.id === active.id);

    const activeColumn = columns.find(col =>
      col.items.some(item => item.id === active.id)
    );

    let overColumn = columns.find(col => col.id === over.id);
    if (!overColumn) {
      overColumn = columns.find(col =>
        col.items.some(item => item.id === over.id)
      );
    }

    if (activeColumn && overColumn && activeItem) {
      if (activeColumn.id !== overColumn.id) {
        if (overColumn.acceptsItemsFrom &&
          !overColumn.acceptsItemsFrom.includes(activeColumn.id)) {
          setActiveId(null);
          setOverId(null);
          return;
        }

        setIsMoving(true);
        try {
          await onItemMove(
            active.id as string,
            activeColumn.id,
            overColumn.id,
            activeItem
          );
        } catch (error) {
          console.error('Failed to move item:', error);
        } finally {
          setIsMoving(false);
        }
      }
    }

    setActiveId(null);
    setOverId(null);
  };

  const activeItem = activeId
    ? columns.flatMap(c => c.items).find(i => i.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={`flex gap-6 overflow-x-auto pb-10 no-scrollbar ${className}`}>
        {columns.map(column => {
          const isDropTarget = overId === column.id ||
            (overId && column.items.some(item => item.id === overId));

          return (
            <SortableContext
              key={column.id}
              id={column.id}
              items={column.items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {renderColumn ? (
                renderColumn(column,
                  column.items.map(item => (
                    <SortableCard
                      key={item.id}
                      item={item}
                      renderCard={renderCard}
                    />
                  ))
                )
              ) : (
                <DroppableColumn
                  column={column}
                  isDropTarget={!!isDropTarget}
                >
                  {column.items.map(item => (
                    <SortableCard
                      key={item.id}
                      item={item}
                      renderCard={renderCard}
                    />
                  ))}
                </DroppableColumn>
              )}
            </SortableContext>
          );
        })}
      </div>

      <DragOverlay dropAnimation={{
        duration: 400,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {activeItem ? (
          <div className="z-50 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rotate-2 scale-[1.02] transition-transform duration-200">
            {renderCard(activeItem, true)}
          </div>
        ) : null}
      </DragOverlay>

      {isMoving && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-full p-4 shadow-xl border border-slate-100">
            <div className="animate-spin h-6 w-6 border-2 border-slate-100 border-t-blue-600 rounded-full" />
          </div>
        </div>
      )}
    </DndContext>
  );
};
