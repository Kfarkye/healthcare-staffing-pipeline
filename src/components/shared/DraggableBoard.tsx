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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-move ${isDragging ? 'z-50' : ''}`}
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
        flex-1 min-w-[280px] max-w-[380px]
        ${isDropTarget ? 'ring-2 ring-blue-500 ring-opacity-50 bg-blue-50/10' : ''}
        transition-all duration-200
      `}
    >
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 h-full">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-900">
              {column.title}
            </h3>
            <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
              {column.items.length}
            </span>
          </div>
        </div>
        <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto">
          {column.items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Drop items here
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
      <div className={`flex gap-4 overflow-x-auto pb-4 ${className}`}>
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
                  isDropTarget={isDropTarget}
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

      <DragOverlay>
        {activeItem ? (
          <div className="opacity-90 rotate-3 scale-105">
            {renderCard(activeItem, true)}
          </div>
        ) : null}
      </DragOverlay>

      {isMoving && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-slate-600 rounded-full" />
          </div>
        </div>
      )}
    </DndContext>
  );
};
