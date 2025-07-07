'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Image,
  Card,
  SimpleGrid,
  FileInput,
  Modal,
  TextInput,
  Badge,
  Center,
  Tooltip,
  Alert
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPhoto,
  IconTrash,
  IconEdit,
  IconUpload,
  IconLink,
  IconStar,
  IconStarFilled,
  IconGripVertical,
  IconAlertCircle
} from '@tabler/icons-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ImageItem {
  id: string;
  url: string;
  alt?: string;
  title?: string;
  isFeatured?: boolean;
}

interface ImageGalleryManagerProps {
  images: ImageItem[];
  featuredImageUrl?: string;
  onChange: (images: ImageItem[], featuredImageUrl?: string) => void;
  maxImages?: number;
  label?: string;
  description?: string;
  error?: string;
  acceptedFileTypes?: string;
  maxFileSize?: number; // in MB
}

/**
 * Image Gallery Manager Component
 * 
 * Manages product images with drag-and-drop reordering, featured image selection,
 * and upload functionality. Supports both file uploads and URL inputs.
 * 
 * @param props - ImageGalleryManagerProps
 * @returns JSX.Element
 */
export default function ImageGalleryManager({
  images,
  featuredImageUrl,
  onChange,
  maxImages = 10,
  label = 'Product Images',
  description = 'Upload images or add image URLs. First image will be the featured image.',
  error,
  acceptedFileTypes = 'image/*',
  maxFileSize = 5 // 5MB
}: ImageGalleryManagerProps) {
  const [uploadModalOpened, { open: openUploadModal, close: closeUploadModal }] = useDisclosure(false);
  const [urlModalOpened, { open: openUrlModal, close: closeUrlModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [uploading, setUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /**
   * Handle drag end for image reordering
   */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = images.findIndex((item) => item.id === active.id);
      const newIndex = images.findIndex((item) => item.id === over?.id);

      const reorderedImages = arrayMove(images, oldIndex, newIndex);
      
      // Update featured image if the first image changed
      const newFeaturedUrl = reorderedImages.length > 0 ? reorderedImages[0].url : undefined;
      onChange(reorderedImages, newFeaturedUrl);
    }
  }, [images, onChange]);

  /**
   * Set featured image
   */
  const setFeaturedImage = useCallback((imageUrl: string) => {
    const updatedImages = images.map(img => ({
      ...img,
      isFeatured: img.url === imageUrl
    }));
    onChange(updatedImages, imageUrl);
  }, [images, onChange]);

  /**
   * Remove image
   */
  const removeImage = useCallback((imageId: string) => {
    const updatedImages = images.filter(img => img.id !== imageId);
    const removedImage = images.find(img => img.id === imageId);
    
    // If the removed image was featured, set the first remaining image as featured
    let newFeaturedUrl = featuredImageUrl;
    if (removedImage?.url === featuredImageUrl) {
      newFeaturedUrl = updatedImages.length > 0 ? updatedImages[0].url : undefined;
    }
    
    onChange(updatedImages, newFeaturedUrl);
  }, [images, featuredImageUrl, onChange]);

  /**
   * Handle file upload
   */
  const handleFileUpload = async () => {
    if (!uploadFiles.length) return;

    setUploading(true);
    try {
      // In a real app, you would upload to your image service (e.g., Cloudinary, AWS S3)
      // For now, we'll create object URLs for demonstration
      const newImages: ImageItem[] = [];
      
      for (const file of uploadFiles) {
        if (file.size > maxFileSize * 1024 * 1024) {
          notifications.show({
            title: 'File too large',
            message: `${file.name} is larger than ${maxFileSize}MB`,
            color: 'red'
          });
          continue;
        }

        const imageUrl = URL.createObjectURL(file);
        newImages.push({
          id: Date.now().toString() + Math.random().toString(36),
          url: imageUrl,
          alt: file.name.split('.')[0],
          title: file.name
        });
      }

      if (newImages.length > 0) {
        const updatedImages = [...images, ...newImages];
        const newFeaturedUrl = images.length === 0 ? newImages[0].url : featuredImageUrl;
        onChange(updatedImages, newFeaturedUrl);
        
        notifications.show({
          title: 'Success',
          message: `${newImages.length} image(s) uploaded successfully`,
          color: 'green'
        });
      }

      setUploadFiles([]);
      closeUploadModal();
    } catch {
      notifications.show({
        title: 'Upload failed',
        message: 'Failed to upload images. Please try again.',
        color: 'red'
      });
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handle URL addition
   */
  const handleUrlAdd = () => {
    if (!imageUrl.trim()) return;

    const newImage: ImageItem = {
      id: Date.now().toString() + Math.random().toString(36),
      url: imageUrl.trim(),
      alt: imageAlt || 'Product image',
      title: imageTitle || 'Product image'
    };

    const updatedImages = [...images, newImage];
    const newFeaturedUrl = images.length === 0 ? newImage.url : featuredImageUrl;
    onChange(updatedImages, newFeaturedUrl);

    setImageUrl('');
    setImageTitle('');
    setImageAlt('');
    closeUrlModal();

    notifications.show({
      title: 'Success',
      message: 'Image added successfully',
      color: 'green'
    });
  };

  /**
   * Handle image edit
   */
  const handleImageEdit = () => {
    if (!selectedImage) return;

    const updatedImages = images.map(img => 
      img.id === selectedImage.id 
        ? { ...img, title: imageTitle, alt: imageAlt }
        : img
    );

    onChange(updatedImages, featuredImageUrl);
    setSelectedImage(null);
    setImageTitle('');
    setImageAlt('');
    closeEditModal();

    notifications.show({
      title: 'Success',
      message: 'Image updated successfully',
      color: 'green'
    });
  };

  /**
   * Open edit modal
   */
  const openEditModalWithImage = (image: ImageItem) => {
    setSelectedImage(image);
    setImageTitle(image.title || '');
    setImageAlt(image.alt || '');
    openEditModal();
  };

  /**
   * Sortable Image Item Component
   */
  const SortableImageItem = ({ image }: { image: ImageItem; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id: image.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <Card
        ref={setNodeRef}
        style={{ ...style, position: 'relative' }}
        withBorder
        p="xs"
      >
        {/* Drag Handle */}
        <Box
          {...listeners}
          {...attributes}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 1,
            cursor: 'grab'
          }}
        >
          <ActionIcon size="sm" variant="light">
            <IconGripVertical size={12} />
          </ActionIcon>
        </Box>

        {/* Featured Badge */}
        {image.url === featuredImageUrl && (
          <Badge
            size="sm"
            color="yellow"
            variant="filled"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1
            }}
          >
            Featured
          </Badge>
        )}

        {/* Image */}
        <Image
          src={image.url}
          alt={image.alt || 'Product image'}
          height={120}
          fit="cover"
          radius="sm"
          mb="xs"
        />

        {/* Actions */}
        <Group justify="center" gap="xs">
          <Tooltip label="Set as featured">
            <ActionIcon
              size="sm"
              variant="light"
              color={image.url === featuredImageUrl ? 'yellow' : 'gray'}
              onClick={() => setFeaturedImage(image.url)}
            >
              {image.url === featuredImageUrl ? (
                <IconStarFilled size={14} />
              ) : (
                <IconStar size={14} />
              )}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit">
            <ActionIcon
              size="sm"
              variant="light"
              onClick={() => openEditModalWithImage(image)}
            >
              <IconEdit size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove">
            <ActionIcon
              size="sm"
              variant="light"
              color="red"
              onClick={() => removeImage(image.id)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Card>
    );
  };

  return (
    <Box>
      <Stack gap="md">
        {/* Header */}
        <Box>
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="sm" fw={500}>
                {label}
              </Text>
              {description && (
                <Text size="xs" c="dimmed" mt={4}>
                  {description}
                </Text>
              )}
            </Box>
            <Badge variant="light" color="gray">
              {images.length} / {maxImages}
            </Badge>
          </Group>
        </Box>

        {/* Error */}
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        {/* Upload Buttons */}
        <Group>
          <Button
            leftSection={<IconUpload size={16} />}
            onClick={openUploadModal}
            disabled={images.length >= maxImages}
            variant="light"
          >
            Upload Images
          </Button>
          <Button
            leftSection={<IconLink size={16} />}
            onClick={openUrlModal}
            disabled={images.length >= maxImages}
            variant="light"
          >
            Add URL
          </Button>
        </Group>

        {/* Images Grid */}
        {images.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={images.map(img => img.id)} 
              strategy={verticalListSortingStrategy}
            >
              <SimpleGrid
                cols={{ base: 2, sm: 3, md: 4 }}
                spacing="md"
              >
                {images.map((image, index) => (
                  <SortableImageItem
                    key={image.id}
                    image={image}
                    index={index}
                  />
                ))}
              </SimpleGrid>
            </SortableContext>
          </DndContext>
        ) : (
          <Center py="xl">
            <Stack align="center" gap="md">
              <IconPhoto size={48} color="var(--mantine-color-gray-4)" />
              <Text c="dimmed">No images added yet</Text>
            </Stack>
          </Center>
        )}
      </Stack>

      {/* Upload Modal */}
      <Modal opened={uploadModalOpened} onClose={closeUploadModal} title="Upload Images">
        <Stack>
          <FileInput
            label="Select Images"
            placeholder="Choose image files"
            accept={acceptedFileTypes}
            multiple
            value={uploadFiles}
            onChange={setUploadFiles}
            leftSection={<IconUpload size={16} />}
          />
          <Text size="xs" c="dimmed">
            Maximum file size: {maxFileSize}MB. Accepted formats: JPG, PNG, GIF, WebP
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeUploadModal}>
              Cancel
            </Button>
            <Button
              onClick={handleFileUpload}
              disabled={uploadFiles.length === 0}
              loading={uploading}
            >
              Upload {uploadFiles.length > 0 && `(${uploadFiles.length})`}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* URL Modal */}
      <Modal opened={urlModalOpened} onClose={closeUrlModal} title="Add Image URL">
        <Stack>
          <TextInput
            label="Image URL"
            placeholder="https://example.com/image.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            required
          />
          <TextInput
            label="Image Title"
            placeholder="Enter image title"
            value={imageTitle}
            onChange={(e) => setImageTitle(e.target.value)}
          />
          <TextInput
            label="Alt Text"
            placeholder="Enter alt text for accessibility"
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeUrlModal}>
              Cancel
            </Button>
            <Button
              onClick={handleUrlAdd}
              disabled={!imageUrl.trim()}
            >
              Add Image
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Modal */}
      <Modal opened={editModalOpened} onClose={closeEditModal} title="Edit Image">
        <Stack>
          {selectedImage && (
            <Image
              src={selectedImage.url}
              alt={selectedImage.alt}
              height={120}
              fit="cover"
              radius="sm"
            />
          )}
          <TextInput
            label="Image Title"
            placeholder="Enter image title"
            value={imageTitle}
            onChange={(e) => setImageTitle(e.target.value)}
          />
          <TextInput
            label="Alt Text"
            placeholder="Enter alt text for accessibility"
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button onClick={handleImageEdit}>
              Update Image
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}