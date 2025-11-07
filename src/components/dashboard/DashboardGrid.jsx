import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Settings, Maximize2, Minimize2 } from "lucide-react";
import DashboardComponent from './DashboardComponent';

export default function DashboardGrid({ 
  components, 
  onUpdateComponents, 
  onRemoveComponent,
  onConfigureComponent,
  gridColumns = 12 
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = (result) => {
    setIsDragging(false);
    
    if (!result.destination) return;

    const items = Array.from(components);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onUpdateComponents(items);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const componentTypeData = e.dataTransfer.getData('componentType');
    
    if (componentTypeData) {
      const componentType = JSON.parse(componentTypeData);
      const newComponent = {
        id: `component-${Date.now()}`,
        type: componentType.id,
        name: componentType.name,
        position: {
          x: 0,
          y: components.length > 0 ? Math.max(...components.map(c => c.position.y + c.position.h)) : 0,
          w: componentType.defaultSize.w,
          h: componentType.defaultSize.h
        },
        config: {
          metric: null,
          filters: {},
          refreshInterval: 60000
        }
      };
      
      onUpdateComponents([...components, newComponent]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleResize = (componentId, direction) => {
    const updated = components.map(comp => {
      if (comp.id === componentId) {
        const newPos = { ...comp.position };
        
        if (direction === 'expand') {
          newPos.w = Math.min(newPos.w + 2, gridColumns);
          newPos.h = newPos.h + 1;
        } else {
          newPos.w = Math.max(newPos.w - 2, 2);
          newPos.h = Math.max(newPos.h - 1, 2);
        }
        
        return { ...comp, position: newPos };
      }
      return comp;
    });
    
    onUpdateComponents(updated);
  };

  if (components.length === 0) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center"
      >
        <div className="text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
          </svg>
          <p className="text-lg font-medium text-gray-600">Empty Dashboard</p>
          <p className="text-sm text-gray-500 mt-1">Drag components from the library or click to add</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="min-h-screen"
    >
      <DragDropContext onDragEnd={handleDragEnd} onDragStart={() => setIsDragging(true)}>
        <Droppable droppableId="dashboard">
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={`grid gap-4 ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
              style={{
                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                gridAutoRows: '100px'
              }}
            >
              {components.map((component, index) => (
                <Draggable key={component.id} draggableId={component.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={{
                        ...provided.draggableProps.style,
                        gridColumn: `span ${component.position.w}`,
                        gridRow: `span ${component.position.h}`
                      }}
                      className={`relative ${snapshot.isDragging ? 'z-50' : ''}`}
                    >
                      <Card className="h-full border-2 hover:border-gray-400 transition-colors">
                        <div className="absolute top-2 right-2 z-10 flex gap-1">
                          <div
                            {...provided.dragHandleProps}
                            className="cursor-move p-1 bg-white rounded border border-gray-300 hover:bg-gray-50"
                          >
                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleResize(component.id, 'expand')}
                          >
                            <Maximize2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleResize(component.id, 'shrink')}
                          >
                            <Minimize2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onConfigureComponent(component)}
                          >
                            <Settings className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => onRemoveComponent(component.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <DashboardComponent component={component} />
                      </Card>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}