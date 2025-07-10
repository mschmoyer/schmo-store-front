'use client';

import React, { useState, useEffect } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  Table,
  Card,
  Badge,
  ActionIcon,
  Menu,
  Text,
  Modal,
  Alert
} from '@mantine/core';
import {
  IconSearch,
  IconPlus,
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconEye,
  IconCheck,
  IconX,
  IconAlertTriangle
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import SupplierModal from './SupplierModal';

interface Supplier {
  id: string;
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
  is_active: boolean;
  performance_rating?: number;
  total_orders?: number;
  on_time_delivery_rate?: number;
  created_at: string;
  updated_at: string;
}

export default function SuppliersManagement() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [supplierModalOpened, { open: openSupplierModal, close: closeSupplierModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    filterSuppliers();
  }, [suppliers, searchQuery]);

  const fetchSuppliers = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/suppliers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSuppliers(result.data || []);
        }
      } else {
        console.error('Failed to fetch suppliers:', response.status);
        setSuppliers([]);
      }
    } catch (error) {
      console.error('Error loading suppliers:', error);
      setSuppliers([]);
      notifications.show({
        title: 'Error',
        message: 'Failed to load suppliers',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const filterSuppliers = () => {
    let filtered = suppliers;
    
    if (searchQuery) {
      filtered = filtered.filter(supplier =>
        supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    setFilteredSuppliers(filtered);
  };

  const handleAddSupplier = () => {
    setSelectedSupplier(null);
    openSupplierModal();
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    openSupplierModal();
  };

  const handleDeleteSupplier = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
    openDeleteModal();
  };

  const confirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/suppliers/${supplierToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          notifications.show({
            title: 'Success',
            message: result.message,
            color: 'green'
          });
          fetchSuppliers();
        }
      } else {
        throw new Error('Failed to delete supplier');
      }
    } catch (error) {
      console.error('Error deleting supplier:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete supplier',
        color: 'red'
      });
    } finally {
      closeDeleteModal();
      setSupplierToDelete(null);
    }
  };

  const handleSupplierSaved = () => {
    fetchSuppliers();
    closeSupplierModal();
    notifications.show({
      title: 'Success',
      message: `Supplier ${selectedSupplier ? 'updated' : 'created'} successfully`,
      color: 'green'
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Text size="xl" fw={600}>Suppliers</Text>
          <Text size="sm" c="dimmed">
            Manage your suppliers and vendor relationships
          </Text>
        </div>
        <Button 
          leftSection={<IconPlus size="1rem" />}
          onClick={handleAddSupplier}
        >
          Add Supplier
        </Button>
      </Group>

      {/* Search and Filters */}
      <Card withBorder>
        <Group>
          <TextInput
            placeholder="Search suppliers..."
            leftSection={<IconSearch size="1rem" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
        </Group>
      </Card>

      {/* Suppliers Table */}
      <Card withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Supplier Name</Table.Th>
              <Table.Th>Contact</Table.Th>
              <Table.Th>Payment Terms</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Performance</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th width={50}></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading ? (
              <Table.Tr>
                <Table.Td colSpan={7} style={{ textAlign: 'center' }}>
                  Loading suppliers...
                </Table.Td>
              </Table.Tr>
            ) : filteredSuppliers.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7} style={{ textAlign: 'center' }}>
                  No suppliers found
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredSuppliers.map((supplier) => (
                <Table.Tr key={supplier.id}>
                  <Table.Td>
                    <div>
                      <Text size="sm" fw={500}>{supplier.name}</Text>
                      {supplier.contact_person && (
                        <Text size="xs" c="dimmed">{supplier.contact_person}</Text>
                      )}
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <div>
                      {supplier.email && (
                        <Text size="xs">{supplier.email}</Text>
                      )}
                      {supplier.phone && (
                        <Text size="xs" c="dimmed">{supplier.phone}</Text>
                      )}
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{supplier.payment_terms || 'Net 30'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge 
                      color={supplier.is_active ? 'green' : 'gray'}
                      leftSection={supplier.is_active ? <IconCheck size="0.8rem" /> : <IconX size="0.8rem" />}
                    >
                      {supplier.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <div>
                      <Text size="xs">{supplier.total_orders || 0} orders</Text>
                      {supplier.on_time_delivery_rate != null && 
                       typeof supplier.on_time_delivery_rate === 'number' && (
                        <Text size="xs" c="dimmed">
                          {supplier.on_time_delivery_rate.toFixed(1)}% on-time
                        </Text>
                      )}
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {formatDate(supplier.created_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Menu shadow="md" width={200}>
                      <Menu.Target>
                        <ActionIcon variant="subtle">
                          <IconDotsVertical size="1rem" />
                        </ActionIcon>
                      </Menu.Target>

                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEye size="1rem" />}
                          onClick={() => handleEditSupplier(supplier)}
                        >
                          View Details
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconEdit size="1rem" />}
                          onClick={() => handleEditSupplier(supplier)}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size="1rem" />}
                          color="red"
                          onClick={() => handleDeleteSupplier(supplier)}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Supplier Modal */}
      <SupplierModal
        opened={supplierModalOpened}
        onClose={closeSupplierModal}
        supplier={selectedSupplier}
        onSuccess={handleSupplierSaved}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Delete Supplier"
        centered
      >
        <Stack gap="md">
          <Alert
            icon={<IconAlertTriangle size="1rem" />}
            color="red"
            variant="light"
          >
            Are you sure you want to delete &quot;{supplierToDelete?.name}&quot;?
            {supplierToDelete && (
              <Text size="sm" mt="xs">
                This action cannot be undone. If this supplier has purchase orders,
                they will be deactivated instead of deleted.
              </Text>
            )}
          </Alert>

          <Group justify="flex-end">
            <Button variant="outline" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDeleteSupplier}>
              Delete Supplier
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}