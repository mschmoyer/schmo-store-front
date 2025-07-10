'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  TextInput,
  Select,
  Textarea,
  Text,
  Card,
  Badge,
  Grid
} from '@mantine/core';
import {
  IconUser,
  IconMail,
  IconPhone,
  IconMapPin,
  IconBuilding,
  IconCheck
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface Supplier {
  id?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  tax_id?: string;
  payment_terms?: string;
  notes?: string;
  is_active?: boolean;
}

interface SupplierModalProps {
  opened: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
  onSuccess?: (supplier: Supplier) => void;
}

export default function SupplierModal({ 
  opened, 
  onClose, 
  supplier, 
  onSuccess 
}: SupplierModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Supplier>({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
    tax_id: '',
    payment_terms: 'Net 30',
    notes: '',
    is_active: true
  });

  useEffect(() => {
    if (opened) {
      if (supplier) {
        setFormData({ ...supplier });
      } else {
        setFormData({
          name: '',
          contact_person: '',
          email: '',
          phone: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'United States',
          tax_id: '',
          payment_terms: 'Net 30',
          notes: '',
          is_active: true
        });
      }
    }
  }, [opened, supplier]);

  const handleInputChange = (field: keyof Supplier, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Supplier name is required',
        color: 'red'
      });
      return false;
    }

    if (formData.email && !formData.email.includes('@')) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please enter a valid email address',
        color: 'red'
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const url = supplier 
        ? `/api/admin/suppliers/${supplier.id}`
        : '/api/admin/suppliers';
      
      const method = supplier ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          notifications.show({
            title: 'Success',
            message: `Supplier ${supplier ? 'updated' : 'created'} successfully!`,
            color: 'green',
            icon: <IconCheck size="1rem" />
          });
          
          if (onSuccess) {
            onSuccess(result.data);
          }
          
          handleClose();
        } else {
          throw new Error(result.error || `Failed to ${supplier ? 'update' : 'create'} supplier`);
        }
      } else {
        throw new Error(`Failed to ${supplier ? 'update' : 'create'} supplier`);
      }
    } catch (error) {
      console.error('Error with supplier:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : `Failed to ${supplier ? 'update' : 'create'} supplier`,
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      tax_id: '',
      payment_terms: 'Net 30',
      notes: '',
      is_active: true
    });
    onClose();
  };

  const isEditing = !!supplier;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`${isEditing ? 'Edit' : 'Add'} Supplier`}
      size="lg"
      centered
    >
      <Stack gap="md">
        {/* Basic Information */}
        <Card withBorder>
          <Group mb="sm">
            <IconBuilding size="1.2rem" />
            <Text fw={500}>Basic Information</Text>
          </Group>
          
          <Stack gap="md">
            <TextInput
              label="Supplier Name"
              placeholder="Enter supplier name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
            />
            
            <TextInput
              label="Contact Person"
              placeholder="Primary contact name"
              value={formData.contact_person}
              onChange={(e) => handleInputChange('contact_person', e.target.value)}
              leftSection={<IconUser size="1rem" />}
            />
            
            <Grid>
              <Grid.Col span={6}>
                <TextInput
                  label="Email"
                  placeholder="contact@supplier.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  leftSection={<IconMail size="1rem" />}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="Phone"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  leftSection={<IconPhone size="1rem" />}
                />
              </Grid.Col>
            </Grid>
          </Stack>
        </Card>

        {/* Address Information */}
        <Card withBorder>
          <Group mb="sm">
            <IconMapPin size="1.2rem" />
            <Text fw={500}>Address Information</Text>
          </Group>
          
          <Stack gap="md">
            <Textarea
              label="Street Address"
              placeholder="Enter street address"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              minRows={2}
            />
            
            <Grid>
              <Grid.Col span={6}>
                <TextInput
                  label="City"
                  placeholder="City"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                />
              </Grid.Col>
              <Grid.Col span={3}>
                <TextInput
                  label="State"
                  placeholder="State"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                />
              </Grid.Col>
              <Grid.Col span={3}>
                <TextInput
                  label="ZIP Code"
                  placeholder="ZIP"
                  value={formData.zip}
                  onChange={(e) => handleInputChange('zip', e.target.value)}
                />
              </Grid.Col>
            </Grid>
            
            <Select
              label="Country"
              value={formData.country}
              onChange={(value) => handleInputChange('country', value || 'United States')}
              data={[
                'United States',
                'Canada',
                'Mexico',
                'United Kingdom',
                'Germany',
                'France',
                'Other'
              ]}
            />
          </Stack>
        </Card>

        {/* Business Information */}
        <Card withBorder>
          <Text fw={500} mb="sm">Business Information</Text>
          
          <Stack gap="md">
            <Grid>
              <Grid.Col span={6}>
                <TextInput
                  label="Tax ID / EIN"
                  placeholder="Tax identification number"
                  value={formData.tax_id}
                  onChange={(e) => handleInputChange('tax_id', e.target.value)}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <Select
                  label="Payment Terms"
                  value={formData.payment_terms}
                  onChange={(value) => handleInputChange('payment_terms', value || 'Net 30')}
                  data={[
                    { value: 'Net 15', label: 'Net 15' },
                    { value: 'Net 30', label: 'Net 30' },
                    { value: 'Net 45', label: 'Net 45' },
                    { value: 'Net 60', label: 'Net 60' },
                    { value: 'Cash on Delivery', label: 'Cash on Delivery' },
                    { value: 'Due on Receipt', label: 'Due on Receipt' },
                    { value: '2/10 Net 30', label: '2/10 Net 30' }
                  ]}
                />
              </Grid.Col>
            </Grid>
            
            <Textarea
              label="Notes"
              placeholder="Additional notes about this supplier"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              minRows={3}
            />
          </Stack>
        </Card>

        {/* Supplier Performance (if editing) */}
        {isEditing && supplier && (
          <Card withBorder>
            <Text fw={500} mb="sm">Supplier Performance</Text>
            <Group>
              <Badge color="green" size="lg">
                Delivery Rating: 95%
              </Badge>
              <Badge color="blue" size="lg">
                Quality Score: 4.5/5
              </Badge>
              <Badge color="cyan" size="lg">
                Active Orders: 3
              </Badge>
            </Group>
          </Card>
        )}

        {/* Action Buttons */}
        <Group justify="space-between" mt="xl">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          
          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={!formData.name.trim()}
          >
            {isEditing ? 'Update Supplier' : 'Add Supplier'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}