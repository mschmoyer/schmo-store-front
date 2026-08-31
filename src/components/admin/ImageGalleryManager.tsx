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
  Tooltip,
  Alert
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
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
import { EmptyState } from '@/components/ui';
import { useAdmin } from '@/contexts/AdminContext';

/** One image as `/api/admin/media` returns it. */
interface UploadedMedia {
  id: string;
  url: string;
  filename: string | null;
  alt_text: string | null;
}

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
  maxFileSize = 10 // MB; mirrors MAX_UPLOAD_BYTES in src/lib/media/store.ts
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
  const { session } = useAdmin();

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
   * Upload the chosen files and add whatever came back.
   *
   * The previous version of this function did not upload anything. It ran
   * `URL.createObjectURL(file)` — a `blob:` URL valid only inside the tab that created it — pushed
   * that string into the product's gallery, and showed "image(s) uploaded successfully". The
   * thumbnail appeared, so the merchant believed it; the image was gone on reload and had never
   * existed for anyone else. A comment reading "In a real app, you would upload to your image
   * service" sat directly above it.
   *
   * Files are reported on individually because a merchant dragging in twelve photographs, one of
   * which is a PDF, should get eleven images and a sentence about the twelfth.
   */
  const handleFileUpload = async () => {
    if (!uploadFiles.length) return;

    if (!session) {
      notifications.show({
        title: 'Not signed in',
        message: 'Your session has expired. Sign in again to upload images.',
        color: 'red'
      });
      return;
    }

    setUploading(true);
    try {
      /* Checked here as well as on the server, purely so a merchant on a slow connection is not
       * told about the limit after uploading 200 MB. The server's check is the one that decides. */
      const tooBig = uploadFiles.filter((file) => file.size > maxFileSize * 1024 * 1024);
      const sendable = uploadFiles.filter((file) => file.size <= maxFileSize * 1024 * 1024);

      if (tooBig.length > 0) {
        notifications.show({
          title: `${tooBig.length} file${tooBig.length === 1 ? '' : 's'} too large`,
          message: `${tooBig.map((f) => f.name).join(', ')} — the limit is ${maxFileSize}MB each.`,
          color: 'yellow',
          autoClose: 8000
        });
      }
      if (sendable.length === 0) {
        setUploading(false);
        return;
      }

      const form = new FormData();
      /* Sent in one request rather than one per file, so the batch is reported as a batch and a
       * slow connection pays for a single round trip. */
      for (const file of sendable) form.append('files', file);

      const response = await fetch('/api/admin/media', {
        method: 'POST',
        body: form
      });
      const payload = await response.json();

      const uploaded: UploadedMedia[] = Array.isArray(payload?.media) ? payload.media : [];
      const failed: { filename: string; reason: string }[] = Array.isArray(payload?.failed)
        ? payload.failed
        : [];

      if (uploaded.length === 0) {
        throw new Error(
          failed[0]?.reason ?? payload?.error ?? `Upload failed (${response.status})`
        );
      }

      const newImages: ImageItem[] = uploaded.map((media) => ({
        id: media.id,
        url: media.url,
        alt: media.alt_text ?? stripExtension(media.filename),
        title: media.filename ?? undefined
      }));

      const updatedImages = [...images, ...newImages];
      const newFeaturedUrl = images.length === 0 ? newImages[0].url : featuredImageUrl;
      onChange(updatedImages, newFeaturedUrl);

      notifications.show({
        title: `${newImages.length} image${newImages.length === 1 ? '' : 's'} uploaded`,
        /* Saying what still has to happen. The images are stored, but the product does not point
         * at them until the form is saved, and a merchant who navigates away now loses the
         * association even though the upload genuinely succeeded. */
        message: 'Save the product to attach them to it.',
        color: 'green'
      });

      if (failed.length > 0) {
        notifications.show({
          title: `${failed.length} file${failed.length === 1 ? '' : 's'} skipped`,
          message: failed.map((f) => `${f.filename}: ${f.reason}`).join(' '),
          color: 'yellow',
          autoClose: 10000
        });
      }

      setUploadFiles([]);
      closeUploadModal();
    } catch (error) {
      notifications.show({
        title: 'Upload failed',
        message: error instanceof Error ? error.message : 'Could not upload the images.',
        color: 'red',
        autoClose: 8000
      });
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handle URL addition
   */
  const handleUrlAdd = () => {
    const candidate = imageUrl.trim();
    if (!candidate) return;

    /*
     * Checked before it goes in the gallery.
     *
     * Typing `not-a-url` and pressing Add succeeded: the gallery reported 1 of 10, marked the entry
     * Featured, and rendered a broken image with the title text spilling out of the tile. Nothing
     * said anything was wrong, and the value would have been saved onto the product and served to
     * shoppers.
     *
     * A site-relative path is allowed because that is what the demo data and the ShipStation import
     * both use.
     */
    const looksLikeUrl =
      candidate.startsWith('/') || /^https?:\/\/[^\s]+\.[^\s]+/i.test(candidate);
    if (!looksLikeUrl) {
      notifications.show({
        title: 'That is not an image address',
        message:
          'Paste a full address beginning http:// or https://, or upload the file instead.',
        color: 'red'
      });
      return;
    }

    const newImage: ImageItem = {
      id: Date.now().toString() + Math.random().toString(36),
      url: candidate,
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
  const handleImageEdit = async () => {
    if (!selectedImage) return;

    /*
     * Alt text is saved to the image, not to the form.
     *
     * This used to update local state and report "Image updated successfully" — then
     * `ProductEditForm` reduced the gallery to `images.map(img => img.url)` on save, discarding
     * `alt` and `title` entirely, and the one endpoint that persists alt text had no caller. So the
     * text was gone on reload, under a green toast, on a field labelled "for accessibility". A
     * screen-reader user got nothing and the merchant believed they had provided it.
     *
     * It goes to the image rather than the product because that is where it belongs: written once,
     * correct everywhere the image is used.
     */
    const mediaId = mediaIdFromUrl(selectedImage.url);

    if (mediaId && session) {
      try {
        const response = await fetch(`/api/admin/media/${mediaId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ alt_text: imageAlt })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? `Could not save (${response.status})`);
        }
      } catch (error) {
        notifications.show({
          title: 'Alt text not saved',
          message: error instanceof Error ? error.message : 'Could not save the description.',
          color: 'red'
        });
        return;
      }
    }

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
      title: 'Saved',
      /* Says which half was stored and which was not, rather than one word covering both. An
       * image added by URL has no row here to attach the description to. */
      message: mediaId
        ? 'Description saved to this image.'
        : 'Updated for this product. Images added by URL cannot store a description — upload the '
          + 'file to keep one with it.',
      color: mediaId ? 'green' : 'yellow'
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
          <EmptyState
            compact
            titleAs="p"
            title="No images yet"
            description="Upload photographs of this product, or drag them in. The first image becomes the thumbnail."
          />
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
/**
 * A filename without its extension, as a first guess at alt text.
 *
 * A guess, and a poor one — "IMG_4471" describes nothing. It is a starting point the merchant can
 * edit, not a substitute for writing one, which is why the edit dialog asks for alt text plainly
 * rather than pre-filling it and moving on.
 *
 * @param filename - The uploaded file's name, when it had one.
 * @returns The stem, or undefined.
 */
function stripExtension(filename: string | null): string | undefined {
  if (!filename) return undefined;
  return filename.replace(/\.[^.]+$/, '') || undefined;
}

/**
 * The media id inside one of this platform's own image URLs.
 *
 * @param url - An image URL, which may point anywhere.
 * @returns The id, or null when the image is not one we store — a URL the merchant pasted, or one
 *   that came from ShipStation.
 */
function mediaIdFromUrl(url: string): string | null {
  const match = /^\/api\/media\/([0-9a-f-]{36})/i.exec(url);
  return match ? match[1] : null;
}
