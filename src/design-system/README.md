# Design System

A comprehensive design system built with React, TypeScript, and Tailwind CSS, following atomic design principles.

## Philosophy

This design system follows **Atomic Design** methodology:

- **Tokens**: Raw design values (colors, spacing, typography)
- **Icons**: SVG icon components with consistent APIs
- **Core (Atoms)**: Basic building blocks (Button, Input, Badge)
- **Modules (Molecules & Organisms)**: Complex components (StatCard, UserProfile, Toast)

## Usage

### Import Tokens

```tsx
import { colors, spacing, typography, shadows } from '@/design-system';

// Use in styled components or custom CSS
const customStyle = {
  color: colors.gray[900],
  padding: spacing[4],
  fontSize: typography.fontSize.sm,
  boxShadow: shadows.md,
};
```

### Import Components

```tsx
import { Button, Input, StatCard, Toast } from '@/design-system';

function MyComponent() {
  return (
    <div>
      <Button variant="primary" size="md">
        Click me
      </Button>
      
      <Input 
        label="Email"
        placeholder="Enter your email"
        icon={<MailIcon />}
      />
      
      <StatCard 
        label="Total Users"
        value="1,247"
        trend="+12%"
      />
    </div>
  );
}
```

## Component Guidelines

### Button

```tsx
<Button variant="primary" size="md" loading={false}>
  Primary Action
</Button>

<Button variant="secondary" icon={<PlusIcon />}>
  Secondary Action
</Button>

<Button variant="ghost" size="sm">
  Subtle Action
</Button>
```

### Input

```tsx
<Input 
  label="Search"
  placeholder="Type to search..."
  icon={<SearchIcon />}
  error="This field is required"
/>
```

### StatCard

```tsx
<StatCard 
  label="Active Users"
  value="1,247"
  trend="+12%"
  delay={100}
  onClick={() => console.log('Clicked')}
/>
```

### Toast

```tsx
<Toast 
  message="Successfully saved!"
  type="success"
  show={showToast}
  onClose={() => setShowToast(false)}
  position="bottom-right"
/>
```

## Design Tokens

### Colors

- **Gray Scale**: 50-950 for neutral colors
- **Blue**: Primary brand color
- **Emerald**: Success states
- **Amber**: Warning states  
- **Red**: Error states
- **Purple/Indigo**: Accent colors

### Spacing

Based on 8px grid system:
- `spacing[1]` = 4px
- `spacing[2]` = 8px
- `spacing[4]` = 16px
- `spacing[8]` = 32px

### Typography

- **Font Family**: System font stack with Apple-style fonts
- **Font Sizes**: xs (12px) to 6xl (60px)
- **Font Weights**: normal, medium, semibold, bold
- **Line Heights**: tight, normal, relaxed

### Shadows

- **Card shadows**: sm, md, lg for different elevation levels
- **Interactive shadows**: button, hover, active states
- **Special shadows**: focus rings, modals, dropdowns

## Best Practices

1. **Use semantic tokens**: Prefer `colors.text.primary` over `colors.gray[900]`
2. **Consistent spacing**: Use the 8px grid system for all spacing
3. **Accessible colors**: All color combinations meet WCAG AA standards
4. **Performance**: Components are tree-shakeable and optimized
5. **Flexibility**: Components accept className props for customization

## Adding New Components

1. **Identify the atomic level**: Is it an atom, molecule, or organism?
2. **Use existing tokens**: Build with existing colors, spacing, and typography
3. **Follow naming conventions**: Use descriptive, semantic names
4. **Add TypeScript**: Include proper type definitions
5. **Document usage**: Add examples and guidelines

## File Structure

```
design-system/
├── tokens/           # Design tokens (colors, spacing, etc.)
├── icons/            # SVG icon components
├── core/             # Atomic components (Button, Input)
├── modules/          # Complex components (StatCard, Toast)
├── styles/           # Global CSS and animations
└── index.ts          # Main export file
```