'use client';

import { useState } from 'react';
import {
  Box,
  Stack,
  Group,
  Text,
  Card,
  Switch,
  Select,
  NumberInput,
  TextInput,
  Button,
  Divider,
  Badge,
  Accordion,
  Alert,
  Textarea,
  ActionIcon,
  Tooltip,
  Modal,
  JsonInput
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPercentage,
  IconCurrencyDollar,
  IconTruck,
  IconTag,
  IconSettings,
  IconPlus,
  IconTrash,
  IconEdit,
  IconAlertTriangle,
  IconCalendar
} from '@tabler/icons-react';
import { DateTimePicker } from '@mantine/dates';

interface DiscountSettings {
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  discount_start_date?: Date;
  discount_end_date?: Date;
  discount_min_quantity?: number;
  discount_max_uses?: number;
  discount_current_uses?: number;
}

interface ShippingSettings {
  requires_shipping: boolean;
  shipping_class?: string;
  weight?: number;
  weight_unit: string;
  length?: number;
  width?: number;
  height?: number;
  dimension_unit: string;
  free_shipping_threshold?: number;
  shipping_cost_override?: number;
}

interface InventorySettings {
  track_inventory: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  allow_backorder: boolean;
  backorder_limit?: number;
  sku_prefix?: string;
  supplier_info?: string;
}

interface CustomField {
  id: string;
  name: string;
  value: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'json';
  description?: string;
}

interface ProductAdvancedSettingsProps {
  discountSettings: DiscountSettings;
  shippingSettings: ShippingSettings;
  inventorySettings: InventorySettings;
  customFields: CustomField[];
  onDiscountChange: (settings: DiscountSettings) => void;
  onShippingChange: (settings: ShippingSettings) => void;
  onInventoryChange: (settings: InventorySettings) => void;
  onCustomFieldsChange: (fields: CustomField[]) => void;
  errors?: {
    discount?: string;
    shipping?: string;
    inventory?: string;
    customFields?: string;
  };
}

/**
 * Product Advanced Settings Component
 * 
 * Provides advanced configuration options for products including:
 * - Discount and promotion settings
 * - Shipping configuration
 * - Inventory tracking options
 * - Custom fields management
 * 
 * @param props - ProductAdvancedSettingsProps
 * @returns JSX.Element
 */
export default function ProductAdvancedSettings({
  discountSettings,
  shippingSettings,
  inventorySettings,
  customFields,
  onDiscountChange,
  onShippingChange,
  onInventoryChange,
  onCustomFieldsChange,
  errors
}: ProductAdvancedSettingsProps) {
  const [customFieldModalOpened, { open: openCustomFieldModal, close: closeCustomFieldModal }] = useDisclosure(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'boolean' | 'date' | 'json'>('text');
  const [newFieldDescription, setNewFieldDescription] = useState('');

  const shippingClasses = [
    { value: 'standard', label: 'Standard' },
    { value: 'expedited', label: 'Expedited' },
    { value: 'overnight', label: 'Overnight' },
    { value: 'freight', label: 'Freight' },
    { value: 'digital', label: 'Digital/No Shipping' }
  ];

  const weightUnits = [
    { value: 'lb', label: 'Pounds (lb)' },
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'oz', label: 'Ounces (oz)' },
    { value: 'g', label: 'Grams (g)' }
  ];

  const dimensionUnits = [
    { value: 'in', label: 'Inches (in)' },
    { value: 'cm', label: 'Centimeters (cm)' },
    { value: 'ft', label: 'Feet (ft)' },
    { value: 'm', label: 'Meters (m)' }
  ];

  const customFieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'json', label: 'JSON' }
  ];

  const handleDiscountChange = (key: keyof DiscountSettings, value: unknown) => {
    onDiscountChange({
      ...discountSettings,
      [key]: value
    });
  };

  const handleShippingChange = (key: keyof ShippingSettings, value: unknown) => {
    onShippingChange({
      ...shippingSettings,
      [key]: value
    });
  };

  const handleInventoryChange = (key: keyof InventorySettings, value: unknown) => {
    onInventoryChange({
      ...inventorySettings,
      [key]: value
    });
  };

  const addCustomField = () => {
    if (!newFieldName.trim()) return;

    const newField: CustomField = {
      id: Date.now().toString(),
      name: newFieldName.trim(),
      value: newFieldValue,
      type: newFieldType,
      description: newFieldDescription.trim() || undefined
    };

    onCustomFieldsChange([...customFields, newField]);
    resetCustomFieldForm();
    closeCustomFieldModal();

    notifications.show({
      title: 'Success',
      message: 'Custom field added successfully',
      color: 'green'
    });
  };

  const updateCustomField = () => {
    if (!editingField || !newFieldName.trim()) return;

    const updatedFields = customFields.map(field =>
      field.id === editingField.id
        ? {
            ...field,
            name: newFieldName.trim(),
            value: newFieldValue,
            type: newFieldType,
            description: newFieldDescription.trim() || undefined
          }
        : field
    );

    onCustomFieldsChange(updatedFields);
    resetCustomFieldForm();
    closeCustomFieldModal();

    notifications.show({
      title: 'Success',
      message: 'Custom field updated successfully',
      color: 'green'
    });
  };

  const removeCustomField = (fieldId: string) => {
    const updatedFields = customFields.filter(field => field.id !== fieldId);
    onCustomFieldsChange(updatedFields);

    notifications.show({
      title: 'Success',
      message: 'Custom field removed successfully',
      color: 'green'
    });
  };

  const editCustomField = (field: CustomField) => {
    setEditingField(field);
    setNewFieldName(field.name);
    setNewFieldValue(field.value);
    setNewFieldType(field.type);
    setNewFieldDescription(field.description || '');
    openCustomFieldModal();
  };

  const resetCustomFieldForm = () => {
    setEditingField(null);
    setNewFieldName('');
    setNewFieldValue('');
    setNewFieldType('text');
    setNewFieldDescription('');
  };

  const openAddFieldModal = () => {
    resetCustomFieldForm();
    openCustomFieldModal();
  };

  const isDiscountActive = () => {
    const now = new Date();
    const startDate = discountSettings.discount_start_date;
    const endDate = discountSettings.discount_end_date;
    
    if (!startDate && !endDate) return true;
    if (startDate && now < startDate) return false;
    if (endDate && now > endDate) return false;
    return true;
  };

  const getDiscountStatus = () => {
    if (!discountSettings.discount_type || !discountSettings.discount_value) return 'inactive';
    if (!isDiscountActive()) return 'scheduled';
    if (discountSettings.discount_max_uses && 
        discountSettings.discount_current_uses && 
        discountSettings.discount_current_uses >= discountSettings.discount_max_uses) return 'expired';
    return 'active';
  };

  const getDiscountStatusColor = () => {
    const status = getDiscountStatus();
    switch (status) {
      case 'active': return 'green';
      case 'scheduled': return 'blue';
      case 'expired': return 'red';
      default: return 'gray';
    }
  };

  return (
    <Stack gap="md">
      <Accordion variant="separated" multiple defaultValue={['discount', 'shipping', 'inventory']}>
        {/* Discount & Promotion Settings */}
        <Accordion.Item value="discount">
          <Accordion.Control icon={<IconPercentage size={16} />}>
            <Group justify="space-between" style={{ width: '100%' }}>
              <Text>Discount & Promotion Settings</Text>
              <Badge color={getDiscountStatusColor()} variant="light" size="sm">
                {getDiscountStatus()}
              </Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {errors?.discount && (
                <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                  {errors.discount}
                </Alert>
              )}

              <Group grow>
                <Select
                  label="Discount Type"
                  placeholder="Select discount type"
                  data={[
                    { value: 'percentage', label: 'Percentage' },
                    { value: 'fixed', label: 'Fixed Amount' }
                  ]}
                  value={discountSettings.discount_type}
                  onChange={(value) => handleDiscountChange('discount_type', value)}
                />
                <NumberInput
                  label="Discount Value"
                  placeholder="Enter discount value"
                  value={discountSettings.discount_value}
                  onChange={(value) => handleDiscountChange('discount_value', value)}
                  min={0}
                  max={discountSettings.discount_type === 'percentage' ? 100 : undefined}
                  leftSection={discountSettings.discount_type === 'percentage' ? <IconPercentage size={16} /> : <IconCurrencyDollar size={16} />}
                  disabled={!discountSettings.discount_type}
                />
              </Group>

              <Group grow>
                <DateTimePicker
                  label="Start Date"
                  placeholder="Select start date"
                  value={discountSettings.discount_start_date}
                  onChange={(value) => handleDiscountChange('discount_start_date', value)}
                  leftSection={<IconCalendar size={16} />}
                  disabled
                  description="Date selection temporarily disabled"
                />
                <DateTimePicker
                  label="End Date"
                  placeholder="Select end date"
                  value={discountSettings.discount_end_date}
                  onChange={(value) => handleDiscountChange('discount_end_date', value)}
                  leftSection={<IconCalendar size={16} />}
                  disabled
                  description="Date selection temporarily disabled"
                />
              </Group>

              <Group grow>
                <NumberInput
                  label="Minimum Quantity"
                  placeholder="Minimum quantity for discount"
                  value={discountSettings.discount_min_quantity}
                  onChange={(value) => handleDiscountChange('discount_min_quantity', value)}
                  min={1}
                />
                <NumberInput
                  label="Maximum Uses"
                  placeholder="Maximum number of uses"
                  value={discountSettings.discount_max_uses}
                  onChange={(value) => handleDiscountChange('discount_max_uses', value)}
                  min={1}
                />
              </Group>

              {discountSettings.discount_current_uses && (
                <Text size="sm" c="dimmed">
                  Current uses: {discountSettings.discount_current_uses} 
                  {discountSettings.discount_max_uses && ` / ${discountSettings.discount_max_uses}`}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Shipping Configuration */}
        <Accordion.Item value="shipping">
          <Accordion.Control icon={<IconTruck size={16} />}>
            Shipping Configuration
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {errors?.shipping && (
                <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                  {errors.shipping}
                </Alert>
              )}

              <Switch
                label="Requires Shipping"
                description="Enable if this product needs to be shipped physically"
                checked={shippingSettings.requires_shipping}
                onChange={(event) => handleShippingChange('requires_shipping', event.currentTarget.checked)}
              />

              {shippingSettings.requires_shipping && (
                <>
                  <Divider />
                  
                  <Select
                    label="Shipping Class"
                    placeholder="Select shipping class"
                    data={shippingClasses}
                    value={shippingSettings.shipping_class}
                    onChange={(value) => handleShippingChange('shipping_class', value)}
                  />

                  <Group grow>
                    <NumberInput
                      label="Weight"
                      placeholder="Enter weight"
                      value={shippingSettings.weight}
                      onChange={(value) => handleShippingChange('weight', value)}
                      min={0}
                      step={0.1}
                      decimalScale={2}
                    />
                    <Select
                      label="Weight Unit"
                      data={weightUnits}
                      value={shippingSettings.weight_unit}
                      onChange={(value) => handleShippingChange('weight_unit', value)}
                    />
                  </Group>

                  <Group grow>
                    <NumberInput
                      label="Length"
                      placeholder="Enter length"
                      value={shippingSettings.length}
                      onChange={(value) => handleShippingChange('length', value)}
                      min={0}
                      step={0.1}
                      decimalScale={2}
                    />
                    <NumberInput
                      label="Width"
                      placeholder="Enter width"
                      value={shippingSettings.width}
                      onChange={(value) => handleShippingChange('width', value)}
                      min={0}
                      step={0.1}
                      decimalScale={2}
                    />
                    <NumberInput
                      label="Height"
                      placeholder="Enter height"
                      value={shippingSettings.height}
                      onChange={(value) => handleShippingChange('height', value)}
                      min={0}
                      step={0.1}
                      decimalScale={2}
                    />
                    <Select
                      label="Dimension Unit"
                      data={dimensionUnits}
                      value={shippingSettings.dimension_unit}
                      onChange={(value) => handleShippingChange('dimension_unit', value)}
                    />
                  </Group>

                  <Group grow>
                    <NumberInput
                      label="Free Shipping Threshold"
                      placeholder="Minimum order value for free shipping"
                      value={shippingSettings.free_shipping_threshold}
                      onChange={(value) => handleShippingChange('free_shipping_threshold', value)}
                      min={0}
                      step={0.01}
                      decimalScale={2}
                      leftSection={<IconCurrencyDollar size={16} />}
                    />
                    <NumberInput
                      label="Shipping Cost Override"
                      placeholder="Fixed shipping cost for this product"
                      value={shippingSettings.shipping_cost_override}
                      onChange={(value) => handleShippingChange('shipping_cost_override', value)}
                      min={0}
                      step={0.01}
                      decimalScale={2}
                      leftSection={<IconCurrencyDollar size={16} />}
                    />
                  </Group>
                </>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Inventory Tracking */}
        <Accordion.Item value="inventory">
          <Accordion.Control icon={<IconTag size={16} />}>
            Inventory Tracking Options
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {errors?.inventory && (
                <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                  {errors.inventory}
                </Alert>
              )}

              <Switch
                label="Track Inventory"
                description="Enable to track stock levels for this product"
                checked={inventorySettings.track_inventory}
                onChange={(event) => handleInventoryChange('track_inventory', event.currentTarget.checked)}
              />

              {inventorySettings.track_inventory && (
                <>
                  <Divider />
                  
                  <Group grow>
                    <NumberInput
                      label="Stock Quantity"
                      placeholder="Current stock quantity"
                      value={inventorySettings.stock_quantity}
                      onChange={(value) => handleInventoryChange('stock_quantity', value)}
                      min={0}
                    />
                    <NumberInput
                      label="Low Stock Threshold"
                      placeholder="Alert when stock reaches this level"
                      value={inventorySettings.low_stock_threshold}
                      onChange={(value) => handleInventoryChange('low_stock_threshold', value)}
                      min={0}
                    />
                  </Group>

                  <Switch
                    label="Allow Backorders"
                    description="Allow customers to order even when out of stock"
                    checked={inventorySettings.allow_backorder}
                    onChange={(event) => handleInventoryChange('allow_backorder', event.currentTarget.checked)}
                  />

                  {inventorySettings.allow_backorder && (
                    <NumberInput
                      label="Backorder Limit"
                      placeholder="Maximum quantity that can be backordered"
                      value={inventorySettings.backorder_limit}
                      onChange={(value) => handleInventoryChange('backorder_limit', value)}
                      min={0}
                    />
                  )}

                  <Group grow>
                    <TextInput
                      label="SKU Prefix"
                      placeholder="Prefix for auto-generated SKUs"
                      value={inventorySettings.sku_prefix}
                      onChange={(event) => handleInventoryChange('sku_prefix', event.currentTarget.value)}
                    />
                    <TextInput
                      label="Supplier Info"
                      placeholder="Supplier information"
                      value={inventorySettings.supplier_info}
                      onChange={(event) => handleInventoryChange('supplier_info', event.currentTarget.value)}
                    />
                  </Group>
                </>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Custom Fields */}
        <Accordion.Item value="custom-fields">
          <Accordion.Control icon={<IconSettings size={16} />}>
            <Group justify="space-between" style={{ width: '100%' }}>
              <Text>Custom Fields</Text>
              <Badge variant="light" size="sm">
                {customFields.length} fields
              </Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {errors?.customFields && (
                <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                  {errors.customFields}
                </Alert>
              )}

              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Add custom fields to store additional product information
                </Text>
                <Button
                  size="sm"
                  leftSection={<IconPlus size={16} />}
                  onClick={openAddFieldModal}
                >
                  Add Field
                </Button>
              </Group>

              {customFields.length > 0 ? (
                <Stack gap="sm">
                  {customFields.map((field) => (
                    <Card key={field.id} withBorder p="sm">
                      <Group justify="space-between">
                        <Box style={{ flex: 1 }}>
                          <Group gap="xs">
                            <Text size="sm" fw={500}>
                              {field.name}
                            </Text>
                            <Badge size="xs" variant="light">
                              {field.type}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" mt="xs">
                            {field.value}
                          </Text>
                          {field.description && (
                            <Text size="xs" c="dimmed" mt="xs">
                              {field.description}
                            </Text>
                          )}
                        </Box>
                        <Group gap="xs">
                          <Tooltip label="Edit">
                            <ActionIcon
                              size="sm"
                              variant="light"
                              onClick={() => editCustomField(field)}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Remove">
                            <ActionIcon
                              size="sm"
                              variant="light"
                              color="red"
                              onClick={() => removeCustomField(field.id)}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No custom fields added yet
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {/* Custom Field Modal */}
      <Modal 
        opened={customFieldModalOpened} 
        onClose={closeCustomFieldModal} 
        title={editingField ? 'Edit Custom Field' : 'Add Custom Field'}
      >
        <Stack gap="md">
          <TextInput
            label="Field Name"
            placeholder="Enter field name"
            value={newFieldName}
            onChange={(event) => setNewFieldName(event.currentTarget.value)}
            required
          />
          
          <Select
            label="Field Type"
            data={customFieldTypes}
            value={newFieldType}
            onChange={(value) => setNewFieldType(value as 'text' | 'number' | 'boolean' | 'date' | 'json')}
          />
          
          {newFieldType === 'json' ? (
            <JsonInput
              label="Field Value"
              placeholder="Enter JSON value"
              value={newFieldValue}
              onChange={setNewFieldValue}
              validationError="Invalid JSON"
              formatOnBlur
              autosize
              minRows={3}
            />
          ) : (
            <TextInput
              label="Field Value"
              placeholder="Enter field value"
              value={newFieldValue}
              onChange={(event) => setNewFieldValue(event.currentTarget.value)}
              type={newFieldType === 'number' ? 'number' : newFieldType === 'date' ? 'date' : 'text'}
            />
          )}
          
          <Textarea
            label="Description"
            placeholder="Enter field description (optional)"
            value={newFieldDescription}
            onChange={(event) => setNewFieldDescription(event.currentTarget.value)}
            autosize
            minRows={2}
          />
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeCustomFieldModal}>
              Cancel
            </Button>
            <Button 
              onClick={editingField ? updateCustomField : addCustomField}
              disabled={!newFieldName.trim()}
            >
              {editingField ? 'Update' : 'Add'} Field
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}